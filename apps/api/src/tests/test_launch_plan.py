import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.launch_plan import (
    LaunchPlanCardType,
    LaunchPlanCanvasDefinition,
    LaunchPlanSectionDefinition,
    LaunchPlanWorkspaceUpdate,
    UserLaunchPlanCard,
    UserLaunchPlanSection,
)
from src.db.organizations import Organization
from src.db.resources import (
    Resource,
    ResourceChannel,
    ResourceChannelResource,
    ResourceComment,
    ResourceTag,
    ResourceTagLink,
    UserResourceChannel,
    UserSavedResource,
    UserSavedResourceChannel,
)
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services.launch_plan import (
    ensure_launch_plan_definitions,
    mark_intro_seen,
    update_workspace,
)


@pytest.fixture()
def session():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine, tables=[
        Organization.__table__,
        User.__table__,
        UserOrganization.__table__,
        ResourceTag.__table__,
        ResourceTagLink.__table__,
        Resource.__table__,
        ResourceChannel.__table__,
        ResourceChannelResource.__table__,
        ResourceComment.__table__,
        UserResourceChannel.__table__,
        UserSavedResource.__table__,
        UserSavedResourceChannel.__table__,
        LaunchPlanCanvasDefinition.__table__,
        LaunchPlanSectionDefinition.__table__,
        UserLaunchPlanSection.__table__,
        UserLaunchPlanCard.__table__,
    ])
    with Session(engine) as db:
        yield db


def seed_member(session: Session):
    org = Organization(
        org_uuid="org_test",
        name="Test",
        slug="test",
        email="test@example.com",
        description=None,
        about=None,
        socials={},
        links={},
        scripts={},
        previews={},
        explore=False,
        creation_date="now",
        update_date="now",
    )
    user = User(
        user_uuid="user_test",
        username="tester",
        email="tester@example.com",
        password="password",
        first_name="Test",
        last_name="User",
        creation_date="now",
        update_date="now",
    )
    session.add(org)
    session.add(user)
    session.commit()
    session.refresh(org)
    session.refresh(user)
    session.add(UserOrganization(user_id=user.id, org_id=org.id, role_id=3, creation_date="now", update_date="now"))
    session.commit()
    return org, user


def test_provisioning_is_idempotent_and_creates_managed_tags(session: Session):
    org, _ = seed_member(session)
    existing_tag = ResourceTag(
        org_id=org.id,
        tag_uuid="resourcetag_existing",
        name="Skills / Executive Functioning",
        creation_date="now",
        update_date="now",
    )
    session.add(existing_tag)
    session.commit()

    ensure_launch_plan_definitions(org.id, session)
    ensure_launch_plan_definitions(org.id, session)

    assert len(session.exec(select(LaunchPlanCanvasDefinition)).all()) == 4
    assert len(session.exec(select(LaunchPlanSectionDefinition)).all()) == 20
    tags = session.exec(select(ResourceTag).where(ResourceTag.managed == True)).all()
    assert len(tags) == 20
    assert all(tag.managed_source_uuid for tag in tags)
    reused = session.exec(select(ResourceTag).where(ResourceTag.tag_uuid == "resourcetag_existing")).first()
    assert reused.managed is True

    section = session.exec(select(LaunchPlanSectionDefinition).where(LaunchPlanSectionDefinition.slug == "executive-functioning")).first()
    original_tag_uuid = reused.tag_uuid
    section.title = "Executive Functioning Skills"
    session.add(section)
    session.commit()
    ensure_launch_plan_definitions(org.id, session)
    session.refresh(reused)
    assert reused.tag_uuid == original_tag_uuid
    assert reused.name == "Skills / Executive Functioning Skills"


@pytest.mark.asyncio
async def test_intro_seen_is_persisted_per_user_section(session: Session):
    org, user = seed_member(session)
    ensure_launch_plan_definitions(org.id, session)
    section = session.exec(select(LaunchPlanSectionDefinition)).first()

    result = await mark_intro_seen(user, org.id, section.section_uuid, session)

    assert result["intro_seen_at"]
    state = session.exec(select(UserLaunchPlanSection)).first()
    assert state.user_id == user.id
    assert state.intro_seen_at


@pytest.mark.asyncio
async def test_workspace_accepts_only_the_owners_resource_outcome(session: Session):
    org, user = seed_member(session)
    ensure_launch_plan_definitions(org.id, session)
    section = session.exec(select(LaunchPlanSectionDefinition)).first()
    resource = Resource(
        org_id=org.id,
        resource_uuid="resource_test",
        title="Assessment",
        external_url="https://example.com",
        creation_date="now",
        update_date="now",
    )
    session.add(resource)
    session.commit()
    session.refresh(resource)

    with pytest.raises(HTTPException):
        await update_workspace(
            user,
            org.id,
            section.section_uuid,
            LaunchPlanWorkspaceUpdate(cards=[{
                "card_type": LaunchPlanCardType.resource_outcome,
                "source_uuid": resource.resource_uuid,
                "grid": {"x": 0, "y": 0, "w": 6, "h": 2},
            }]),
            session,
        )

    session.add(UserSavedResource(
        user_id=user.id,
        resource_id=resource.id,
        outcome_text="My result",
        creation_date="now",
        update_date="now",
    ))
    session.add(ResourceTagLink(resource_id=resource.id, tag_id=section.resource_tag_id, creation_date="now"))
    session.commit()
    await update_workspace(
        user,
        org.id,
        section.section_uuid,
        LaunchPlanWorkspaceUpdate(notes="<b>Notes</b>", cards=[{
            "card_type": LaunchPlanCardType.resource_outcome,
            "source_uuid": resource.resource_uuid,
            "grid": {"x": 0, "y": 0, "w": 6, "h": 2},
        }]),
        session,
    )

    assert len(session.exec(select(UserLaunchPlanCard)).all()) == 1
    assert session.exec(select(UserLaunchPlanSection)).first().notes == "<b>Notes</b>"
