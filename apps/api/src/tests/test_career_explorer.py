"""The career explorer: O*NET careers as resources, their profile with pay where the learner might live, Career swipe and the EPP."""

from sqlmodel import select

from src.db.life_plans import CareerEntry, CareerSkip, EstimateFact, EstimateSource, LifePlan, ProgramEntry
from src.db.resources import Resource, ResourceNoteBlock, UserSavedResource, UserSavedResourceUpdate
from src.db.users import PublicUser
from src.services.epp import report
from src.services.life_plans import careers
from src.services.life_plans.estimates import dims_key
from src.tests.test_mcp import mcp  # noqa: F401  (fixture)
from src.tests.test_mcp_resources import resources_mcp  # noqa: F401  (fixture)

ARTSY = {"R": 1, "I": 2, "A": 18, "S": 9, "E": 4, "C": 1}
CATALOG = (
    ("27-1024.00", "Graphic Designers", 4, (2.0, 2.5, 7.0, 2.0, 3.0, 1.5)),
    ("15-1252.00", "Software Developers", 4, (3.0, 6.5, 2.0, 1.5, 2.5, 4.5)),
    ("29-2056.00", "Veterinary Technologists and Technicians", 3, (5.0, 5.5, 1.0, 4.0, 1.5, 3.0)),
    ("27-1013.00", "Fine Artists", 3, (2.5, 2.0, 7.0, 2.5, 2.0, 1.0)),
)


def _catalog(session) -> None:
    bind = session.get_bind()
    for model in (EstimateSource, EstimateFact, CareerEntry, CareerSkip, LifePlan, ResourceNoteBlock, ProgramEntry):
        model.__table__.create(bind, checkfirst=True)
    source = EstimateSource(key="onet-31-0", title="O*NET 31.0", license="CC BY 4.0")
    session.add(source)
    session.commit()
    for code, title, zone, values in CATALOG:
        session.add(CareerEntry(code=code, soc=code[:7], title=title, job_zone=zone, interests=dict(zip("RIASEC", values)),
                                description=f"{title} do things.", tasks=[f"A task of {title}"], source_id=source.id, status="reviewed"))
    session.add(CareerEntry(code="99-9999.00", soc="99-9999", title="Draft Job", interests=dict(zip("RIASEC", (1, 2, 3, 4, 5, 6))), source_id=source.id, status="draft"))
    session.add(CareerEntry(code="27-1019.00", soc="27-1019", title="Artists, All Other", interests={}, source_id=source.id, status="reviewed"))
    soc = "27-1024"
    for place, value, period, pct in (("state:OR", 62000.0, "yr", {"p25": 48000.0, "p75": 80000.0}), ("area:0021660", 25.0, "hr", {}), ("area:0038900", 35.0, "hr", {})):
        session.add(EstimateFact(metric="wage", place=place, dims={"soc": soc}, dims_key=dims_key({"soc": soc}), label="Graphic Designers", value=value,
                                 percentiles=pct, period=period, stat="median", dollar_year=2025, source_id=source.id, status="reviewed"))
    session.commit()


def _learner(alice) -> PublicUser:
    return PublicUser.model_validate(alice, from_attributes=True)


def _loaded(resources_mcp):  # noqa: F811
    session, _, call, alice = resources_mcp
    _catalog(session)
    channel = call("save_resource_channel", {"name": "Careers"})["structuredContent"]
    result = call("add_career_resources", {"channel_uuid": channel["channel_uuid"]})
    assert not result.get("isError"), result
    return session, call, alice, channel, result["structuredContent"]


def test_reviewed_onet_careers_become_career_resources_once(resources_mcp):  # noqa: F811
    session, call, _, channel, first = _loaded(resources_mcp)
    # Drafts and careers with no interest profile are left out.
    assert sorted(first["added"]) == ["Fine Artists", "Graphic Designers", "Software Developers", "Veterinary Technologists and Technicians"]
    designer = session.exec(select(Resource).where(Resource.title == "Graphic Designers")).one()
    assert designer.resource_type == "career" and designer.external_url == "https://www.onetonline.org/link/summary/27-1024.00"
    assert designer.provider_name == "O*NET OnLine" and careers.code_of(designer) == "27-1024.00"

    again = call("add_career_resources", {"channel_uuid": channel["channel_uuid"], "job_zones": [3]})["structuredContent"]
    assert again["added"] == [] and sorted(again["updated"]) == ["Fine Artists", "Veterinary Technologists and Technicians"]
    assert len(session.exec(select(Resource).where(Resource.resource_type == "career")).all()) == 4


def test_profile_puts_pay_where_the_learner_might_live_first(resources_mcp, monkeypatch):  # noqa: F811
    session, _, alice, _, _ = _loaded(resources_mcp)
    monkeypatch.setattr(careers, "quiz_scores", lambda db, user_id: ARTSY)
    session.add(LifePlan(plan_uuid="lifeplan_1", user_id=alice.id, document={"start": "2027-06", "phases": [
        {"id": "p1", "title": "College", "place": "city:OR:eugene", "place_label": "Eugene, OR"}]}))
    session.commit()

    page = careers.profile(session, _learner(alice), "27-1024.00", org_id=1)
    assert page["match"] > 0.7 and page["career"]["tasks"] == ["A task of Graphic Designers"]
    assert page["pay"]["overall"] == {"place": "Oregon", "median": 62000, "p25": 48000, "p75": 80000, "year": 2025}
    # Eugene pays less than Portland, but it's where the learner's plan goes, so it comes first and is marked.
    first, second = page["pay"]["areas"]
    assert first["area"] == "area:0021660" and first["mine"] and first["my_place"] == "Eugene, OR" and first["median"] == 52000
    assert second["area"] == "area:0038900" and not second["mine"]
    assert page["resource_uuid"] and page["similar"][0]["title"] == "Fine Artists" and page["similar"][0]["resource_uuid"]
    assert careers.profile(session, _learner(alice), "99-9999.00") is None


def test_swipe_deals_closest_matches_first_and_a_skip_only_pushes_back(resources_mcp, monkeypatch):  # noqa: F811
    session, _, alice, _, _ = _loaded(resources_mcp)
    monkeypatch.setattr(careers, "quiz_scores", lambda db, user_id: ARTSY)
    learner = _learner(alice)

    deck = careers.deck(session, learner, 1, size=2)
    assert deck["has_quiz"] and deck["total"] == 4
    assert [card["title"] for card in deck["cards"]] == ["Fine Artists", "Graphic Designers"]
    assert deck["cards"][1]["pay"] == {"yearly": 62000}

    careers.skip(session, learner, "27-1013.00")
    assert [card["title"] for card in careers.deck(session, learner, 1)["cards"]][-1] == "Fine Artists"
    careers.unskip(session, learner, "27-1013.00")
    assert careers.deck(session, learner, 1, size=1)["cards"][0]["title"] == "Fine Artists"

    designer = session.exec(select(Resource).where(Resource.title == "Graphic Designers")).one()
    session.add(UserSavedResource(user_id=alice.id, resource_id=designer.id, creation_date="2026-11-04", update_date="2026-11-04"))
    session.commit()
    deck = careers.deck(session, learner, 1)
    assert deck["total"] == 3 and "Graphic Designers" not in [card["title"] for card in deck["cards"]]


def test_without_a_quiz_the_deck_is_a_steady_shuffle(resources_mcp, monkeypatch):  # noqa: F811
    session, _, alice, _, _ = _loaded(resources_mcp)
    monkeypatch.setattr(careers, "quiz_scores", lambda db, user_id: None)
    first = careers.deck(session, _learner(alice), 1)
    assert not first["has_quiz"] and all(card["match"] is None for card in first["cards"])
    assert [c["code"] for c in first["cards"]] == [c["code"] for c in careers.deck(session, _learner(alice), 1)["cards"]]


def test_only_careers_marked_for_the_epp_show_on_it_with_why(resources_mcp):  # noqa: F811
    session, _, alice, _, _ = _loaded(resources_mcp)
    designer, developer = (session.exec(select(Resource).where(Resource.title == title)).one() for title in ("Graphic Designers", "Software Developers"))
    session.add(UserSavedResource(user_id=alice.id, resource_id=designer.id, notes="I draw every day.", interest_level=3, show_on_epp=True,
                                  creation_date="2026-11-04T10:00:00", update_date=""))
    session.add(UserSavedResource(user_id=alice.id, resource_id=developer.id, show_on_epp=False, creation_date="2026-11-04T11:00:00", update_date=""))
    session.commit()
    assert report.careers(session, alice.id) == [{"title": "Graphic Designers", "code": "27-1024.00", "why": "I draw every day.", "interest_level": 3, "saved_on": "2026-11-04"}]


def test_interest_level_is_one_to_three():
    import pytest
    from pydantic import ValidationError

    assert UserSavedResourceUpdate(interest_level=2, show_on_epp=True).interest_level == 2
    with pytest.raises(ValidationError):
        UserSavedResourceUpdate(interest_level=4)


def _oregon_data(session) -> None:
    """OED wages with percentiles (2026, newer than BLS 2025), BLS history, OED projections and O*NET education."""
    dims = {"soc": "27-1024"}
    wages = EstimateSource(key="oed-wages-2026", publisher="Oregon Employment Department", title="Oregon Occupational Wage Information, 2026")
    history = [EstimateSource(key=f"bls-oews-{year}", publisher="U.S. Bureau of Labor Statistics", title=f"OEWS May {year}") for year in (2023, 2024)]
    projections = EstimateSource(key="oed-projections-2024-2034", publisher="Oregon Employment Department", title="Oregon occupational employment projections, 2024-2034")
    session.add_all([wages, projections, *history])
    session.commit()
    pct = {"p10": 20.0, "p25": 24.0, "p75": 36.0, "p90": 44.0}
    for place, median in (("state:OR", 31.0), ("region:OR:douglas", 26.5), ("region:OR:portland-tri-county", 34.0)):
        session.add(EstimateFact(metric="wage", place=place, dims=dims, dims_key=dims_key(dims), value=median, percentiles={**pct, "p50": median},
                                 period="hr", stat="median", dollar_year=2026, source_id=wages.id, status="reviewed"))
    for src, value in zip(history, (27.0, 28.5)):
        session.add(EstimateFact(metric="wage", place="state:OR", dims=dims, dims_key=dims_key(dims), value=value, period="hr", stat="median",
                                 dollar_year=int(src.key[-4:]), source_id=src.id, status="reviewed"))
    for place, jobs, later, openings in (("state:OR", 2000, 2200, 210.0), ("region:OR:southwestern", 120, 126, 11.4)):
        for metric, value in (("employment", jobs), ("employment_projected", later), ("growth", (later - jobs) / jobs), ("openings", openings)):
            session.add(EstimateFact(metric=metric, place=place, dims=dims, dims_key=dims_key(dims), value=value, period="yr" if metric == "openings" else "",
                                     note="typical entry: Bachelor's degree; competitive: Bachelor's degree" if metric == "openings" and place == "state:OR" else "",
                                     source_id=projections.id, status="reviewed"))
    designer = session.exec(select(CareerEntry).where(CareerEntry.code == "27-1024.00")).one()
    designer.education = [{"level": 5, "pct": 20.0}, {"level": 6, "pct": 80.0}]
    designer.related = ["29-2056.00", "15-1252.00", "00-0000.00"]
    session.add(designer)
    session.commit()


def test_career_page_answers_pay_and_jobs_near_home_with_training_and_related(resources_mcp, monkeypatch):  # noqa: F811
    from src.db.portfolio import Portfolio

    session, _, alice, _, _ = _loaded(resources_mcp)
    Portfolio.__table__.create(session.get_bind(), checkfirst=True)
    monkeypatch.setattr(careers, "quiz_scores", lambda db, user_id: ARTSY)
    _oregon_data(session)
    session.add(Portfolio(portfolio_uuid="portfolio_1", user_id=alice.id, location_label="Roseburg, Oregon"))
    session.commit()

    page = careers.profile(session, _learner(alice), "27-1024.00", org_id=1)
    # Home base comes from the portfolio; the nearest place with pay is Douglas County, from OED 2026.
    assert page["home"] == {"key": "city:OR:roseburg", "label": "Roseburg, OR", "from": "portfolio"}
    wages = page["wages"]
    assert wages["here"] == "region:OR:douglas"
    douglas = next(row for row in wages["places"] if row["place"] == "region:OR:douglas")
    assert douglas["hourly"] == {"p10": 20.0, "p25": 24.0, "p50": 26.5, "p75": 36.0, "p90": 44.0} and douglas["yearly"]["p50"] == 55100
    assert douglas["year"] == 2026 and douglas["source"].startswith("Oregon Employment Department")
    oregon = next(row for row in wages["places"] if row["place"] == "state:OR")
    assert oregon["year"] == 2026 and oregon["hourly"]["p50"] == 31.0
    # Over time: BLS's own figures for the years it has, OED's for the year BLS doesn't.
    assert [(row["year"], row["hourly"]) for row in wages["history"]["state:OR"]] == [(2023, 27.0), (2024, 28.5), (2025, 29.81), (2026, 31.0)]

    jobs = page["outlook"]
    assert jobs["here"] == "region:OR:southwestern" and (jobs["start"], jobs["end"]) == (2024, 2034)
    assert jobs["places"][0] == {"place": "state:OR", "label": "Oregon", "jobs": 2000, "jobs_later": 2200, "growth": 0.1, "openings": 210}
    assert jobs["entry"] == {"typical": "Bachelor's degree", "competitive": "Bachelor's degree"}

    assert page["career"]["education"] == [{"level": 5, "pct": 20.0}, {"level": 6, "pct": 80.0}]
    # O*NET's related careers, in its order, skipping ones we don't have.
    assert [item["title"] for item in page["similar"]] == ["Veterinary Technologists and Technicians", "Software Developers"]


def test_home_base_reads_typed_places():
    assert careers.resolve_place("Douglas County, OR") == {"key": "county:OR:douglas", "label": "Douglas County, OR"}
    assert careers.resolve_place("roseburg")["key"] == "city:OR:roseburg"
    assert careers.resolve_place("Boise, ID") == {"key": "state:ID", "label": "Idaho"}
    assert careers.resolve_place("") is None and careers.resolve_place("Somewhere") is None


def test_career_paths_list_programs_near_home_and_open_schools_as_resources(resources_mcp, monkeypatch):  # noqa: F811
    from src.db.life_plans import SchoolEntry
    from src.db.portfolio import Portfolio

    session, call, alice, _, _ = _loaded(resources_mcp)
    monkeypatch.setattr(careers, "quiz_scores", lambda db, user_id: None)
    bind = session.get_bind()
    for model in (Portfolio, SchoolEntry):
        model.__table__.create(bind, checkfirst=True)
    source = EstimateSource(key="college-scorecard-institutions-2025-10-03", title="College Scorecard")
    programs = EstimateSource(key="scorecard-programs-2026-10-15", publisher="U.S. Department of Education", title="College Scorecard, most recent field of study data")
    session.add_all([source, programs])
    session.commit()
    session.add(SchoolEntry(unitid="208646", name="Lane Community College", city="Eugene", state="OR", url="www.lanecc.edu/", control="Public", source_id=source.id, status="reviewed"))
    session.add(SchoolEntry(unitid="230764", name="University of Utah", city="Salt Lake City", state="UT", url="www.utah.edu", control="Public", source_id=source.id, status="reviewed"))
    for unitid, credential in (("208646", 2), ("230764", 3)):
        session.add(ProgramEntry(unitid=unitid, school="", cip="50.04", title="Design and Applied Arts", credential=credential, graduates=20,
                                 earnings_5yr=40000, source_id=programs.id, status="reviewed"))
    session.add(Portfolio(portfolio_uuid="portfolio_1", user_id=alice.id, location_label="Eugene, OR"))
    session.commit()
    channel = call("save_resource_channel", {"name": "Schools"})["structuredContent"]
    assert not call("add_school_resources", {"channel_uuid": channel["channel_uuid"]}).get("isError")
    lane = session.exec(select(Resource).where(Resource.title == "Lane Community College")).one()

    paths = careers.profile(session, _learner(alice), "27-1024.00", org_id=1)["paths"]
    # Utah's program isn't online, so only the Oregon school near home is listed; it opens as the school resource.
    assert [(p["school"], p["near"], p["resource_uuid"]) for p in paths["programs"]] == [("Lane Community College", "In your town", lane.resource_uuid)]
    assert paths["families"] == [{"cip": "50.04", "title": "Design and Applied Arts", "weight": 4}]
