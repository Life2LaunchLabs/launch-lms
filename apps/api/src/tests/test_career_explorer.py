"""The career explorer: O*NET careers as resources, their profile with pay where the learner might live, Career swipe and the EPP."""

from sqlmodel import select

from src.db.life_plans import CareerEntry, CareerSkip, EstimateFact, EstimateSource, LifePlan
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
    for model in (EstimateSource, EstimateFact, CareerEntry, CareerSkip, LifePlan, ResourceNoteBlock):
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
