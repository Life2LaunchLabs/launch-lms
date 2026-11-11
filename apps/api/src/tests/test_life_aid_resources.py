"""Budget lines that pull resources: the Grant line shows the aid links from Resources (the organization's
own and the Library's) that fit its topics and the phase's state (services/life_plans/aid_resources.py)."""

from sqlmodel import Session, SQLModel, create_engine, select

from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.resource_library import OrgSavedChannel, OrgSavedResource
from src.db.resources import (
    Resource, ResourceChannel, ResourceChannelResource, ResourceComment, ResourceTag, ResourceTagLink, UserResourceChannel,
    UserSavedResource, UserSavedResourceChannel,
)
from src.db.user_organizations import UserOrganization
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.users import PublicUser, User
from src.services.life_plans import aid_resources as aid
from src.services.life_plans.catalog import catalog

NOW = "2026-01-01T00:00:00+00:00"
PLATFORM, SCHOOL, OTHER = 1, 2, 3
LEARNER = 21
EUGENE, TEXAS = "city:OR:eugene", "state:TX"


def _world() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[model.__table__ for model in (
        Organization, OrganizationConfig, User, UserOrganization, UserGroupUser, UserGroupResource,
        Resource, ResourceChannel, ResourceChannelResource, ResourceComment, ResourceTag, ResourceTagLink, UserSavedResource,
        UserResourceChannel, UserSavedResourceChannel,
        OrgSavedChannel, OrgSavedResource,
    )])
    db = Session(engine)
    for org_id in (PLATFORM, SCHOOL, OTHER):
        db.add(Organization(id=org_id, org_uuid=f"org_{org_id}", name=f"Org {org_id}", slug=f"org{org_id}", email=f"o{org_id}@example.com", creation_date=NOW, update_date=NOW))
        db.add(OrganizationConfig(org_id=org_id, config={"config_version": "3.0", "tier": "free"}, creation_date=NOW, update_date=NOW))
    db.add(User(id=LEARNER, user_uuid="user_21", username="u21", email="u21@example.com", first_name="U", last_name="21", creation_date=NOW, update_date=NOW))
    db.add(UserOrganization(user_id=LEARNER, org_id=SCHOOL, role_id=4, creation_date=NOW, update_date=NOW))
    # The platform's Library channel, the school's own channel, and another org's channel nobody here sees.
    for channel_id, org_id, listed in ((1, PLATFORM, True), (2, SCHOOL, False), (3, OTHER, False)):
        db.add(ResourceChannel(id=channel_id, org_id=org_id, channel_uuid=f"channel_{channel_id}", name=f"Channel {channel_id}", audience="org", listed=listed, creation_date=NOW, update_date=NOW))
    db.commit()
    return db


def _resource(db: Session, resource_id: int, channel_id: int, *tags: str, title: str | None = None) -> None:
    org_id = db.get(ResourceChannel, channel_id).org_id
    db.add(Resource(id=resource_id, org_id=org_id, resource_uuid=f"resource_{resource_id}", title=title or f"Resource {resource_id}",
                    resource_type="guide", external_url=f"https://example.com/{resource_id}", creation_date=NOW, update_date=NOW))
    db.add(ResourceChannelResource(channel_id=channel_id, resource_id=resource_id))
    for name in tags:
        tag = db.exec(select(ResourceTag).where(ResourceTag.org_id == org_id, ResourceTag.name == name)).first()
        if tag is None:
            tag = ResourceTag(org_id=org_id, tag_uuid=f"tag_{org_id}_{name}", name=name, creation_date=NOW, update_date=NOW)
            db.add(tag)
            db.flush()
        db.add(ResourceTagLink(resource_id=resource_id, tag_id=tag.id))
    db.commit()


def _user() -> PublicUser:
    return PublicUser(id=LEARNER, user_uuid="user_21", username="u21", email="u21@example.com", first_name="U", last_name="21")


def _uuids(db: Session, item: str, place: str | None = EUGENE, org_id: int | None = SCHOOL) -> list[str]:
    return [r["resource_uuid"] for r in aid.aid_resources(db, _user(), org_id, item, place)["resources"]]


def test_grant_and_scholarship_items_name_their_resource_topics():
    items = {item["key"]: item for item in catalog()["items"]}
    assert aid.topics_for("grant") == {"grants": 3, "fafsa": 2, "financial aid": 1}
    assert "scholarships" in aid.topics_for("scholarship")
    assert aid.topics_for("rent") == {}
    assert items["grant"]["resources"]


def test_grant_line_pulls_library_and_own_aid_links_best_first():
    with _world() as db:
        _resource(db, 1, 1, "FAFSA", "Grants", title="Fill out the FAFSA")
        _resource(db, 2, 1, "Financial aid", title="Paying for college")
        _resource(db, 3, 2, "grants", title="Our aid office")  # the school's own, lower-case tag
        _resource(db, 4, 3, "Grants", "FAFSA", title="Hidden")  # another org's private channel
        _resource(db, 5, 1, "Careers", title="Not about aid")
        assert _uuids(db, "grant") == ["resource_1", "resource_3", "resource_2"]


def test_state_specific_aid_only_shows_in_that_state_and_rises_there():
    with _world() as db:
        _resource(db, 1, 1, "Grants", title="Federal Pell Grant")
        _resource(db, 2, 1, "Grants", "Oregon", title="Oregon Opportunity Grant")
        assert _uuids(db, "grant", EUGENE) == ["resource_2", "resource_1"]
        assert _uuids(db, "grant", TEXAS) == ["resource_1"]
        result = aid.aid_resources(db, _user(), SCHOOL, "grant", EUGENE)
        assert result["state"] == "Oregon"
        # No place yet: show everything, no state lift.
        assert _uuids(db, "grant", None) == ["resource_1", "resource_2"]


def test_saved_resources_lead_ties_and_items_without_topics_get_nothing():
    with _world() as db:
        _resource(db, 1, 1, "Grants", title="A grant guide")
        _resource(db, 2, 1, "Grants", title="B grant guide")
        db.add(UserSavedResource(user_id=LEARNER, resource_id=2, creation_date=NOW, update_date=NOW))
        db.commit()
        rows = aid.aid_resources(db, _user(), SCHOOL, "grant", EUGENE)["resources"]
        assert [r["resource_uuid"] for r in rows] == ["resource_2", "resource_1"]
        assert rows[0]["is_saved"] is True
        assert _uuids(db, "rent") == []
        # Without an org, the Library still answers.
        assert _uuids(db, "grant", org_id=None) == ["resource_2", "resource_1"]


def test_state_of_reads_the_place_ladder():
    assert aid.state_of(EUGENE) == "OR"
    assert aid.state_of(TEXAS) == "TX"
    assert aid.state_of(None) is None
    assert aid.state_of("us") is None
