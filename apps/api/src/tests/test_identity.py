import pytest
from sqlalchemy import JSON
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.courses.courses import Course
from src.db.podcasts.podcasts import Podcast
from src.db.identity import (
    DevelopmentState,
    InsightStatus,
    LifeFrameworkNode,
    UserInsight,
    UserKnowledgeEntry,
    UserKnowledgeEntryTag,
)
from src.db.organizations import Organization
from src.db.resources import Resource, ResourceChannel, ResourceChannelResource, UserSavedResourceUpdate
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.identity import get_framework, get_identity_summary
from src.services.courses.courses import _course_framework_node_keys, _set_course_framework_tags
from src.services.resources import save_resource_for_user


NOW = "2026-05-08T12:00:00+00:00"


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Course.__table__.c.seo.type = JSON()
    Podcast.__table__.c.seo.type = JSON()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_base(session)
        yield session


def seed_base(session: Session) -> None:
    org = Organization(id=1, org_uuid="org_1", name="Wayne Enterprises", slug="wayne", email="hello@wayne.dev", creation_date=NOW, update_date=NOW)
    user = User(
        id=1,
        user_uuid="user_1",
        username="batman",
        first_name="Bruce",
        last_name="Wayne",
        email="bruce@wayne.dev",
        details={},
        profile={},
        creation_date=NOW,
        update_date=NOW,
    )
    membership = UserOrganization(id=1, user_id=1, org_id=1, role_id=3, creation_date=NOW, update_date=NOW)
    inner = LifeFrameworkNode(id=1, key="inner_world", title="Inner World", node_type="domain", sort_order=10, creation_date=NOW, update_date=NOW)
    values = LifeFrameworkNode(
        id=2,
        key="inner_world.personal_drivers.culture_values",
        parent_id=1,
        title="Culture & Values",
        node_type="driver",
        sort_order=20,
        creation_date=NOW,
        update_date=NOW,
    )
    outer = LifeFrameworkNode(id=3, key="outer_world", title="Outer World", node_type="domain", sort_order=30, creation_date=NOW, update_date=NOW)
    executive = LifeFrameworkNode(
        id=4,
        key="outer_world.executive_function",
        parent_id=3,
        title="Executive Function",
        node_type="skill",
        sort_order=40,
        creation_date=NOW,
        update_date=NOW,
    )
    lifestyle = LifeFrameworkNode(id=5, key="target_lifestyle", title="Target Lifestyle", node_type="domain", sort_order=50, creation_date=NOW, update_date=NOW)
    environment = LifeFrameworkNode(
        id=6,
        key="target_lifestyle.environment",
        parent_id=5,
        title="Environment",
        node_type="lifestyle",
        sort_order=60,
        creation_date=NOW,
        update_date=NOW,
    )
    session.add(org)
    session.add(user)
    session.add(membership)
    session.add(inner)
    session.add(values)
    session.add(outer)
    session.add(executive)
    session.add(lifestyle)
    session.add(environment)
    session.commit()


def public_user(session: Session) -> PublicUser:
    user = session.get(User, 1)
    return PublicUser.model_validate(user)


@pytest.mark.asyncio
async def test_framework_returns_seeded_tree(db_session: Session):
    roots = await get_framework(public_user(db_session), 1, db_session)

    assert [node.key for node in roots] == ["inner_world", "outer_world", "target_lifestyle"]
    assert roots[0].children[0].key == "inner_world.personal_drivers.culture_values"
    assert roots[2].children[0].key == "target_lifestyle.environment"
    assert roots[0].development_state == DevelopmentState.empty


@pytest.mark.asyncio
async def test_summary_development_state_emerging_from_confirmed_insight(db_session: Session):
    entry = UserKnowledgeEntry(
        id=1,
        entry_uuid="knowledge_1",
        user_id=1,
        org_id=1,
        source_type="manual_note",
        title="My values note",
        status="active",
        creation_date=NOW,
        update_date=NOW,
    )
    tag = UserKnowledgeEntryTag(id=1, entry_id=1, framework_node_id=2, creation_date=NOW)
    insight = UserInsight(
        id=1,
        insight_uuid="insight_1",
        user_id=1,
        org_id=1,
        framework_node_id=2,
        insight_type="value",
        label="Autonomy",
        status=InsightStatus.confirmed,
        creation_date=NOW,
        update_date=NOW,
    )
    db_session.add(entry)
    db_session.add(tag)
    db_session.add(insight)
    db_session.commit()

    summary = await get_identity_summary(public_user(db_session), 1, db_session)
    values = summary.roots[0].children[0]

    assert values.development_state == DevelopmentState.emerging
    assert summary.top_insights[0].label == "Autonomy"


@pytest.mark.asyncio
async def test_resource_outcome_save_upserts_single_knowledge_entry(db_session: Session):
    resource = Resource(
        id=1,
        org_id=1,
        resource_uuid="resource_1",
        title="Self discovery tool",
        description="",
        external_url="https://example.com",
        is_live=True,
        creation_date=NOW,
        update_date=NOW,
    )
    channel = ResourceChannel(id=1, org_id=1, channel_uuid="channel_1", name="Public", public=True, creation_date=NOW, update_date=NOW)
    link = ResourceChannelResource(id=1, channel_id=1, resource_id=1, creation_date=NOW, update_date=NOW)
    db_session.add(resource)
    db_session.add(channel)
    db_session.add(link)
    db_session.commit()

    await save_resource_for_user(None, "resource_1", UserSavedResourceUpdate(outcome_text="Autonomy matters."), public_user(db_session), db_session)
    await save_resource_for_user(None, "resource_1", UserSavedResourceUpdate(outcome_text="Autonomy still matters."), public_user(db_session), db_session)

    entries = db_session.exec(select(UserKnowledgeEntry).where(UserKnowledgeEntry.source_type == "resource_outcome")).all()

    assert len(entries) == 1
    assert entries[0].body == "Autonomy still matters."


def test_course_framework_tags_can_be_set_and_replaced(db_session: Session):
    course = Course(
        id=1,
        org_id=1,
        course_uuid="course_1",
        name="Identity Skills",
        description="",
        about="",
        learnings="[]",
        tags="",
        public=True,
        open_to_contributors=False,
        creation_date=NOW,
        update_date=NOW,
    )
    db_session.add(course)
    db_session.commit()

    _set_course_framework_tags(
        1,
        "course_1",
        ["outer_world.executive_function", "inner_world.personal_drivers.culture_values"],
        db_session,
    )
    db_session.commit()

    assert _course_framework_node_keys(course, db_session) == [
        "inner_world.personal_drivers.culture_values",
        "outer_world.executive_function",
    ]

    _set_course_framework_tags(1, "course_1", ["outer_world.executive_function"], db_session)
    db_session.commit()

    assert _course_framework_node_keys(course, db_session) == ["outer_world.executive_function"]
