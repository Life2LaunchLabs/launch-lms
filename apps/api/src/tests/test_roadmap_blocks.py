import pytest
from fastapi import HTTPException
from sqlalchemy import JSON
from sqlmodel import Session, SQLModel, create_engine

from src.db.courses.courses import Course
from src.db.organizations import Organization
from src.db.podcasts.podcasts import Podcast
from src.db.roadmap_blocks import RoadmapBlockCreate, RoadmapBlockRequirementCreate, RoadmapPathwayBlockCreate, RoadmapPathwayBlockUpdate, RoadmapBlockUpdate
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.roadmap_blocks import create_block, create_block_requirement, create_pathway_block, ensure_default_pathway, update_block, update_pathway_block


NOW = "2026-05-14T12:00:00+00:00"


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Course.__table__.c.seo.type = JSON()
    Podcast.__table__.c.seo.type = JSON()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        org = Organization(id=1, org_uuid="org_1", name="Launch Org", slug="launch", email="hello@example.com", creation_date=NOW, update_date=NOW)
        user = User(id=1, user_uuid="user_1", username="launcher", first_name="Life", last_name="Launcher", email="launcher@example.com", details={}, profile={}, creation_date=NOW, update_date=NOW)
        membership = UserOrganization(id=1, user_id=1, org_id=1, role_id=3, creation_date=NOW, update_date=NOW)
        session.add(org)
        session.add(user)
        session.add(membership)
        session.commit()
        yield session


def public_user(session: Session) -> PublicUser:
    return PublicUser.model_validate(session.get(User, 1))


@pytest.mark.asyncio
async def test_ensure_default_pathway_is_idempotent(db_session: Session):
    user = public_user(db_session)
    first = await ensure_default_pathway(user, 1, db_session)
    second = await ensure_default_pathway(user, 1, db_session)

    assert first.pathway.title == "My Pathway"
    assert first.pathway.pathway_uuid == second.pathway.pathway_uuid
    assert len(first.blocks) == 1
    assert len(second.blocks) == 1
    assert first.blocks[0].block.is_draft is True
    assert first.blocks[0].block.editable is True


@pytest.mark.asyncio
async def test_user_blocks_editable_and_org_blocks_locked(db_session: Session):
    user = public_user(db_session)
    block = await create_block(user, 1, RoadmapBlockCreate(title="Custom RN", lane_category="work"), db_session)
    updated = await update_block(user, 1, block.block_uuid, RoadmapBlockUpdate(title="Registered Nurse"), db_session)
    assert updated.title == "Registered Nurse"
    assert updated.editable is True

    catalog = await create_block(user, 1, RoadmapBlockCreate(title="Catalog degree", lane_category="education", visibility="org"), db_session)
    assert catalog.editable is False
    with pytest.raises(HTTPException) as exc:
        await update_block(user, 1, catalog.block_uuid, RoadmapBlockUpdate(title="Edited"), db_session)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_locked_definition_can_still_have_editable_pathway_instance(db_session: Session):
    user = public_user(db_session)
    path = await ensure_default_pathway(user, 1, db_session)
    catalog = await create_block(user, 1, RoadmapBlockCreate(title="Catalog job", lane_category="work", visibility="org"), db_session)

    updated = await update_pathway_block(
        user,
        1,
        path.blocks[0].pathway_block_uuid,
        RoadmapPathwayBlockUpdate(block_uuid=catalog.block_uuid, start_date="2028-01", title_override="My catalog job"),
        db_session,
    )

    assert updated.blocks[0].block.editable is False
    assert updated.blocks[0].title_override == "My catalog job"


@pytest.mark.asyncio
async def test_direct_requirement_must_end_before_dependent_starts(db_session: Session):
    user = public_user(db_session)
    degree = await create_block(user, 1, RoadmapBlockCreate(title="Nursing degree", lane_category="education"), db_session)
    rn = await create_block(user, 1, RoadmapBlockCreate(title="RN role", lane_category="work", default_monthly_income=6200), db_session)
    await create_block_requirement(user, 1, rn.block_uuid, RoadmapBlockRequirementCreate(required_block_uuid=degree.block_uuid), db_session)
    path = await ensure_default_pathway(user, 1, db_session)

    dependent = await update_pathway_block(user, 1, path.blocks[0].pathway_block_uuid, RoadmapPathwayBlockUpdate(block_uuid=rn.block_uuid, start_date="2028-07", end_date="2028-12"), db_session)
    assert dependent.summary.unmet_requirement_count == 1

    overlapping = await create_pathway_block(user, 1, dependent.pathway.pathway_uuid, RoadmapPathwayBlockCreate(block_uuid=degree.block_uuid, start_date="2028-01", end_date="2028-07"), db_session)
    assert overlapping.summary.unmet_requirement_count == 1

    degree_instance = next(block for block in overlapping.blocks if block.block.block_uuid == degree.block_uuid)
    satisfied = await update_pathway_block(user, 1, degree_instance.pathway_block_uuid, RoadmapPathwayBlockUpdate(end_date="2028-06"), db_session)
    assert satisfied.summary.unmet_requirement_count == 0


@pytest.mark.asyncio
async def test_pathway_summary_handles_concurrency_and_finances(db_session: Session):
    user = public_user(db_session)
    path = await ensure_default_pathway(user, 1, db_session)
    work = await create_block(user, 1, RoadmapBlockCreate(title="Part-time job", lane_category="work", default_monthly_income=1000), db_session)
    school = await create_block(user, 1, RoadmapBlockCreate(title="College", lane_category="education", default_monthly_expense=600, default_one_time_cost=1200), db_session)

    first = await update_pathway_block(user, 1, path.blocks[0].pathway_block_uuid, RoadmapPathwayBlockUpdate(block_uuid=work.block_uuid, start_date="2026-01", end_date="2026-03"), db_session)
    final = await create_pathway_block(user, 1, first.pathway.pathway_uuid, RoadmapPathwayBlockCreate(block_uuid=school.block_uuid, start_date="2026-02", end_date="2026-04"), db_session)

    assert final.summary.total_months == 4
    assert final.summary.total_estimated_income == 3000
    assert final.summary.total_estimated_cost == 3000
    assert final.summary.support_needed == 0
