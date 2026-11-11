"""Suggestions for a plan phase (services/recommend): shelves with reasons, the four picks, hiding, and Save to
this phase filling a Library list named after the phase."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.life_plans import CareerEntry, EstimateSource, LifePlan, SchoolEntry
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.recommendations import PhaseResourceList, RecommendationEvent
from src.db.resource_library import OrgSavedChannel, OrgSavedResource
from src.db.resources import (
    Resource, ResourceChannel, ResourceChannelResource, ResourceTag, ResourceTagLink, UserResourceChannel,
    UserSavedResource, UserSavedResourceChannel,
)
from src.db.user_organizations import UserOrganization
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.users import PublicUser, User
from src.services.recommend import engine, lists

NOW = "2026-01-01T00:00:00+00:00"
PLATFORM, SCHOOL, OTHER = 1, 2, 3
PERSON = 21
BIOLOGIST, WARDEN, HYDRO = "19-1023.00", "33-3031.00", "19-2043.00"

COLLEGE = {
    "id": "college", "title": "College at Oregon State", "kind": "learning", "place": "city:OR:corvallis", "months": 48, "living": "dorm",
    "activities": [{"kind": "learning", "level": "uni", "school": "Oregon State University", "school_id": "100", "career": BIOLOGIST, "career_title": "Marine biologist"}],
}
WORK = {"id": "work", "title": "First job", "kind": "working", "months": 24, "activities": [{"kind": "looking"}]}


def _world() -> Session:
    db_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(db_engine, tables=[model.__table__ for model in (
        Organization, OrganizationConfig, User, UserOrganization, UserGroupUser, UserGroupResource,
        Resource, ResourceChannel, ResourceChannelResource, ResourceTag, ResourceTagLink, UserSavedResource,
        UserResourceChannel, UserSavedResourceChannel, OrgSavedChannel, OrgSavedResource,
        LifePlan, EstimateSource, CareerEntry, SchoolEntry, RecommendationEvent, PhaseResourceList,
    )])
    db = Session(db_engine)
    for org_id in (PLATFORM, SCHOOL, OTHER):
        db.add(Organization(id=org_id, org_uuid=f"org_{org_id}", name=f"Org {org_id}", slug=f"org{org_id}", email=f"o{org_id}@example.com", creation_date=NOW, update_date=NOW))
        db.add(OrganizationConfig(org_id=org_id, config={"config_version": "3.0", "tier": "free"}, creation_date=NOW, update_date=NOW))
    db.add(User(id=PERSON, user_uuid="user_21", username="u21", email="u21@example.com", first_name="U", last_name="21", creation_date=NOW, update_date=NOW))
    db.add(UserOrganization(user_id=PERSON, org_id=SCHOOL, role_id=4, creation_date=NOW, update_date=NOW))
    # The platform's Library channel, the school's channels (one named like a topic), another org's private one.
    for channel_id, org_id, listed, name in ((1, PLATFORM, True, "Library"), (2, SCHOOL, False, "Paying for school"), (3, OTHER, False, "Hidden"),
                                              (4, SCHOOL, False, "Careers"), (5, SCHOOL, False, "Schools"), (6, SCHOOL, False, "Work and jobs")):
        db.add(ResourceChannel(id=channel_id, org_id=org_id, channel_uuid=f"channel_{channel_id}", name=name, audience="org", listed=listed, creation_date=NOW, update_date=NOW))
    db.add(EstimateSource(id=1, key="onet", title="O*NET", creation_date=NOW))
    for code, title, related in ((BIOLOGIST, "Zoologists and Wildlife Biologists", [WARDEN, HYDRO]), (WARDEN, "Fish and Game Wardens", []), (HYDRO, "Hydrologists", [])):
        db.add(CareerEntry(code=code, soc=code[:7], title=title, related=related, source_id=1, status="reviewed", creation_date=NOW))
    for unitid, name, students, url in (("100", "Oregon State University", 30000, "https://oregonstate.edu"), ("200", "University of Oregon", 22000, "https://uoregon.edu"),
                                        ("300", "Tiny College", 400, "https://tiny.edu")):
        db.add(SchoolEntry(unitid=unitid, name=name, state="OR", degree="bachelor", control="public", students=students, url=url, source_id=1, status="reviewed", creation_date=NOW))
    db.add(LifePlan(plan_uuid="plan_1", user_id=PERSON, document={"version": 1, "start": "2026-09", "phases": [COLLEGE, WORK]}, creation_date=NOW, update_date=NOW))
    db.commit()
    return db


def _resource(db: Session, resource_id: int, channel_id: int, *tags: str, title: str, kind: str = "guide", url: str | None = None) -> None:
    org_id = db.get(ResourceChannel, channel_id).org_id
    db.add(Resource(id=resource_id, org_id=org_id, resource_uuid=f"resource_{resource_id}", title=title, resource_type=kind,
                    external_url=url or f"https://example.com/{resource_id}", creation_date=NOW, update_date=NOW))
    db.add(ResourceChannelResource(channel_id=channel_id, resource_id=resource_id))
    for name in tags:
        tag = db.exec(select(ResourceTag).where(ResourceTag.org_id == org_id, ResourceTag.name == name)).first()
        if tag is None:
            tag = ResourceTag(org_id=org_id, tag_uuid=f"tag_{org_id}_{name}", name=name, creation_date=NOW, update_date=NOW)
            db.add(tag)
            db.flush()
        db.add(ResourceTagLink(resource_id=resource_id, tag_id=tag.id))
    db.commit()


def _content(db: Session) -> None:
    _resource(db, 1, 1, "FAFSA", title="FAFSA")                      # Library, tagged
    _resource(db, 2, 2, title="Oregon Opportunity Grant")             # school channel named like the topic
    _resource(db, 3, 1, "Grants", "Texas", title="Texas grant")       # another state's
    _resource(db, 4, 3, "FAFSA", title="Hidden FAFSA guide")          # a channel nobody here sees
    _resource(db, 5, 6, title="Resume basics")                        # work topic only
    for rid, code, title in ((10, BIOLOGIST, "Zoologists"), (11, WARDEN, "Fish and game wardens"), (12, HYDRO, "Hydrologists")):
        _resource(db, rid, 4, title=title, kind="career", url=f"https://www.onetonline.org/link/summary/{code}")
    for rid, url, title in ((20, "https://oregonstate.edu", "Oregon State University"), (21, "https://uoregon.edu", "University of Oregon"), (22, "https://tiny.edu/", "Tiny College")):
        _resource(db, rid, 5, title=title, kind="school", url=url)


def _user() -> PublicUser:
    return PublicUser(id=PERSON, user_uuid="user_21", username="u21", email="u21@example.com", first_name="U", last_name="21")


def _shelf(result: dict, prefix: str) -> dict | None:
    return next((s for s in result["shelves"] if s["key"].startswith(prefix)), None)


def _titles(shelf: dict | None) -> list[str]:
    return [item["title"] for item in (shelf or {}).get("items", [])]


def test_a_college_phase_gets_aid_careers_like_and_schools_like_with_reasons():
    with _world() as db:
        _content(db)
        result = engine.for_phase(db, _user(), SCHOOL, "college")
        assert result["context"] == {"key": "phase:college", "label": "College at Oregon State"}
        paying = _shelf(result, "topic:paying_for_school")
        assert paying["title"] == "Paying for school" and paying["why"] == "Because this phase has school"
        # Tagged first, then the channel named like the topic; another state's and an unseen channel's left out.
        assert _titles(paying) == ["FAFSA", "Oregon Opportunity Grant"]
        careers = _shelf(result, "careers_like:")
        assert careers["title"] == "Careers like Marine biologist" and careers["why"] == "On your plan"
        assert _titles(careers) == ["Fish and game wardens", "Hydrologists"]
        schools = _shelf(result, "schools_like:")
        assert schools["title"] == "Schools like Oregon State University"
        assert _titles(schools) == ["University of Oregon", "Tiny College"]  # closest in size first
        assert _titles(_shelf(result, "in_context")) == ["Zoologists", "Oregon State University"]
        assert "Resume basics" not in [t for s in result["shelves"] for t in _titles(s)]
        # Four picks, mixing reasons rather than four from one shelf, never the phase's own picks.
        assert len(result["picks"]) == 4
        assert len({p["shelf"] for p in result["picks"]}) >= 3
        assert all(p["reason"] for p in result["picks"])
        assert "Oregon State University" not in [p["title"] for p in result["picks"]]
        assert result["list"] is None


def test_a_job_hunting_phase_gets_work_resources():
    with _world() as db:
        _content(db)
        result = engine.for_phase(db, _user(), SCHOOL, "work")
        assert [s["key"] for s in result["shelves"]] == ["topic:finding_work"]
        assert result["shelves"][0]["why"] == "You're looking for work here"
        assert [p["title"] for p in result["picks"]] == ["Resume basics"]


def test_saved_things_show_as_the_library_shelf_and_hidden_ones_go():
    with _world() as db:
        _content(db)
        db.add(UserSavedResource(user_id=PERSON, resource_id=2, creation_date=NOW, update_date=NOW))
        db.commit()
        lists.record(db, _user(), SCHOOL, [{"kind": "hide", "resource_uuid": "resource_1", "context": "phase:college", "shelf": "topic:paying_for_school"},
                                          {"kind": "bogus", "resource_uuid": "resource_11"}])
        result = engine.for_phase(db, _user(), SCHOOL, "college")
        assert _titles(_shelf(result, "library")) == ["Oregon Opportunity Grant"]
        assert _shelf(result, "library")["items"][0]["is_saved"] is True
        assert _shelf(result, "topic:paying_for_school") is None  # FAFSA hidden, the grant is in the Library shelf
        assert "Fish and game wardens" in _titles(_shelf(result, "careers_like:"))
        # Hidden only in that phase, and unhiding brings it back.
        lists.record(db, _user(), SCHOOL, [{"kind": "unhide", "resource_uuid": "resource_1", "context": "phase:college"}])
        assert "FAFSA" in _titles(_shelf(engine.for_phase(db, _user(), SCHOOL, "college"), "topic:paying_for_school"))


def test_save_to_this_phase_makes_one_list_named_for_the_phase():
    with _world() as db:
        _content(db)
        first = lists.save_to_phase(db, _user(), SCHOOL, "college", "resource_1", "topic:paying_for_school")
        assert first["name"] == "College at Oregon State" and first["count"] == 1
        lists.save_to_phase(db, _user(), SCHOOL, "college", "resource_11")
        channels = db.exec(select(UserResourceChannel).where(UserResourceChannel.user_id == PERSON)).all()
        assert len(channels) == 1 and channels[0].org_id == SCHOOL
        result = engine.for_phase(db, _user(), SCHOOL, "college")
        assert result["list"]["count"] == 2
        assert [r["title"] for r in result["list"]["items"]] == ["FAFSA", "Fish and game wardens"]
        everything = [t for s in result["shelves"] for t in _titles(s)]
        assert "FAFSA" not in everything and "Fish and game wardens" not in everything
        assert db.exec(select(RecommendationEvent).where(RecommendationEvent.kind == "save")).all()
        # Out of the phase's list, still in the Library.
        lists.remove_from_phase(db, _user(), SCHOOL, "college", "resource_1")
        assert engine.for_phase(db, _user(), SCHOOL, "college")["list"]["count"] == 1
        assert db.exec(select(UserSavedResource).where(UserSavedResource.resource_id == 1)).first() is not None
        # A deleted list is made again on the next save.
        # (SQLite here doesn't cascade, so the rows Postgres would drop with the list go by hand.)
        for row in [*db.exec(select(UserSavedResourceChannel).where(UserSavedResourceChannel.user_channel_id == channels[0].id)).all(),
                    *db.exec(select(PhaseResourceList).where(PhaseResourceList.user_channel_id == channels[0].id)).all(), channels[0]]:
            db.delete(row)
        db.commit()
        again = lists.save_to_phase(db, _user(), SCHOOL, "college", "resource_2")
        assert again["count"] == 1 and again["user_channel_uuid"] != first["user_channel_uuid"]


def test_unknown_phases_unseen_resources_and_other_orgs_are_refused():
    with _world() as db:
        _content(db)
        with pytest.raises(HTTPException) as missing:
            engine.for_phase(db, _user(), SCHOOL, "nope")
        assert missing.value.status_code == 404
        with pytest.raises(HTTPException) as unseen:
            lists.save_to_phase(db, _user(), SCHOOL, "college", "resource_4")
        assert unseen.value.status_code == 404
        with pytest.raises(HTTPException) as outsider:
            lists.save_to_phase(db, _user(), OTHER, "college", "resource_1")
        assert outsider.value.status_code == 403
