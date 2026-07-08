from sqlmodel import Session, create_engine

from src.db.custom_domains import CustomDomain
from src.db.learning import LearningBadge
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.plan_requests import PlanRequest
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.routers.superadmin import get_org_badges
from src.services.superadmin.orgs import get_organization, list_organizations


def _create_tables(engine) -> None:
    Organization.__table__.create(engine)
    OrganizationConfig.__table__.create(engine)
    User.__table__.create(engine)
    UserOrganization.__table__.create(engine)
    Role.__table__.create(engine)
    LearningBadge.__table__.create(engine)
    PlanRequest.__table__.create(engine)
    CustomDomain.__table__.create(engine)


def _create_org(session: Session, *, org_id: int, slug: str) -> Organization:
    org = Organization(
        id=org_id,
        org_uuid=f"org_{org_id}",
        name=slug.capitalize(),
        slug=slug,
        email=f"{slug}@example.com",
        creation_date="2026-01-01T00:00:00+00:00",
        update_date="2026-01-01T00:00:00+00:00",
    )
    session.add(org)
    session.add(
        OrganizationConfig(
            org_id=org_id,
            config={"config_version": "2.0", "plan": "free"},
            creation_date="2026-01-01T00:00:00+00:00",
            update_date="2026-01-01T00:00:00+00:00",
        )
    )
    session.commit()
    return org


def _create_badge(session: Session, *, badge_id: int, org_id: int, name: str) -> None:
    session.add(
        LearningBadge(
            id=badge_id,
            org_id=org_id,
            badge_uuid=f"badge_{badge_id}",
            name=name,
            status="published",
            creation_date="2026-01-01T00:00:00+00:00",
            update_date="2026-01-01T00:00:00+00:00",
        )
    )


def test_superadmin_orgs_report_badge_counts():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)

    with Session(engine) as session:
        org_one = _create_org(session, org_id=1, slug="one")
        org_two = _create_org(session, org_id=2, slug="two")
        _create_badge(session, badge_id=1, org_id=org_one.id, name="First")
        _create_badge(session, badge_id=2, org_id=org_two.id, name="Second")
        _create_badge(session, badge_id=3, org_id=org_two.id, name="Third")
        session.commit()

        listed = list_organizations(session, sort="badges_desc")
        assert [item["slug"] for item in listed["items"]] == ["two", "one"]
        assert listed["items"][0]["badge_count"] == 2
        assert listed["items"][0]["course_count"] == 2

        detail = get_organization(session, org_one.id)
        assert detail["badge_count"] == 1
        assert detail["course_count"] == 1


async def test_superadmin_org_badges_endpoint_lists_learning_badges():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)

    with Session(engine) as session:
        org = _create_org(session, org_id=1, slug="one")
        _create_badge(session, badge_id=1, org_id=org.id, name="First")
        _create_badge(session, badge_id=2, org_id=org.id, name="Second")
        session.commit()

        result = await get_org_badges(org.id, page=1, limit=20, db_session=session)

        assert result["total"] == 2
        assert {item["badge_uuid"] for item in result["items"]} == {"badge_1", "badge_2"}
