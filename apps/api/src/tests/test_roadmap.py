import pytest
from sqlalchemy import JSON
from sqlmodel import Session, SQLModel, create_engine

from src.db.courses.courses import Course
from src.db.organizations import Organization
from src.db.podcasts.podcasts import Podcast
from src.db.roadmap import (
    RoadmapEventCreate,
    RoadmapOptionCreate,
    RoadmapRequirementCreate,
    RoadmapRequirementLogic,
)
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.roadmap import (
    create_event,
    create_requirement,
    create_roadmap_option,
    get_roadmap_option,
    list_roadmap_options,
)


NOW = "2026-05-14T12:00:00+00:00"


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
    org = Organization(id=1, org_uuid="org_1", name="Launch Org", slug="launch", email="hello@example.com", creation_date=NOW, update_date=NOW)
    user = User(
        id=1,
        user_uuid="user_1",
        username="launcher",
        first_name="Life",
        last_name="Launcher",
        email="launcher@example.com",
        details={},
        profile={},
        creation_date=NOW,
        update_date=NOW,
    )
    membership = UserOrganization(id=1, user_id=1, org_id=1, role_id=3, creation_date=NOW, update_date=NOW)
    session.add(org)
    session.add(user)
    session.add(membership)
    session.commit()


def public_user(session: Session) -> PublicUser:
    user = session.get(User, 1)
    return PublicUser.model_validate(user)


@pytest.mark.asyncio
async def test_roadmap_option_lifecycle_and_summary(db_session: Session):
    user = public_user(db_session)
    detail = await create_roadmap_option(
        user,
        1,
        RoadmapOptionCreate(
            title="RN path",
            end_state_title="Registered Nurse",
            skill_fit_score=7,
            lifestyle_fit_score=8,
            confidence_score=6,
            expected_annual_income_low=65000,
            expected_annual_income_mid=78000,
            expected_annual_income_high=92000,
            expected_monthly_living_expenses=2200,
        ),
        db_session,
    )

    requirement_detail = await create_requirement(
        user,
        1,
        detail.option.roadmap_uuid,
        RoadmapRequirementCreate(
            title="GED",
            category="credential",
            requirement_logic=RoadmapRequirementLogic.one_of,
            requirement_group_key="secondary_credential",
        ),
        db_session,
    )
    requirement = requirement_detail.requirements[0]

    await create_event(
        user,
        1,
        detail.option.roadmap_uuid,
        RoadmapEventCreate(
            category="education",
            title="Nursing program",
            start_date="2026-09",
            end_date="2028-06",
            estimated_monthly_expense=600,
            estimated_one_time_cost=2500,
            required_step=True,
            requirement_uuid=requirement.requirement_uuid,
        ),
        db_session,
    )
    final_detail = await create_event(
        user,
        1,
        detail.option.roadmap_uuid,
        RoadmapEventCreate(
            category="work",
            title="RN role",
            start_date="2028-07",
            end_date="2028-12",
            estimated_monthly_income=6200,
        ),
        db_session,
    )

    assert final_detail.summary.total_months == 28
    assert final_detail.summary.months_until_first_income == 23
    assert final_detail.summary.support_needed > 0
    assert final_detail.summary.satisfied_requirement_count == 1
    assert final_detail.summary.requirement_count == 1

    listed = await list_roadmap_options(user, 1, db_session)
    fetched = await get_roadmap_option(user, 1, detail.option.roadmap_uuid, db_session)

    assert len(listed) == 1
    assert fetched.option.end_state_title == "Registered Nurse"
