import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.plan_requests import PlanRequest, PlanRequestUpdate
from src.routers.superadmin import _get_single_org_config, update_plan_request


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Organization.__table__.create(engine)
    OrganizationConfig.__table__.create(engine)
    PlanRequest.__table__.create(engine)
    with Session(engine) as session:
        yield session


def _create_org(session: Session, *, org_id: int = 1, slug: str = "acme") -> Organization:
    org = Organization(
        id=org_id,
        org_uuid=f"org_{org_id}",
        name="Acme",
        slug=slug,
        email=f"{slug}@example.com",
        creation_date="2026-01-01T00:00:00+00:00",
        update_date="2026-01-01T00:00:00+00:00",
    )
    session.add(org)
    session.commit()
    return org


@pytest.mark.asyncio
async def test_update_plan_request_approval_persists_org_plan(db_session: Session):
    org = _create_org(db_session)
    db_session.add(
        OrganizationConfig(
            org_id=org.id,
            config={"config_version": "2.0", "plan": "free", "packages": []},
            creation_date="2026-01-01T00:00:00+00:00",
            update_date="2026-01-01T00:00:00+00:00",
        )
    )
    db_session.add(
        PlanRequest(
            org_id=org.id,
            request_uuid="req_1",
            request_type="plan_upgrade",
            requested_value="enterprise",
            status="pending",
            creation_date="2026-01-01T00:00:00+00:00",
            update_date="2026-01-01T00:00:00+00:00",
        )
    )
    db_session.commit()

    result = await update_plan_request(
        "req_1",
        PlanRequestUpdate(status="approved"),
        db_session=db_session,
    )

    org_config = db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == org.id)
    ).one()

    assert result.status == "approved"
    assert org_config.config["plan"] == "enterprise"
    assert org_config.update_date != "2026-01-01T00:00:00+00:00"


def test_get_single_org_config_raises_when_duplicates_exist(db_session: Session):
    org = _create_org(db_session, org_id=2, slug="dupe")
    db_session.add(
        OrganizationConfig(
            org_id=org.id,
            config={"config_version": "2.0", "plan": "free"},
            creation_date="2026-01-01T00:00:00+00:00",
            update_date="2026-01-01T00:00:00+00:00",
        )
    )
    db_session.add(
        OrganizationConfig(
            org_id=org.id,
            config={"config_version": "2.0", "plan": "enterprise"},
            creation_date="2026-01-02T00:00:00+00:00",
            update_date="2026-01-02T00:00:00+00:00",
        )
    )
    db_session.commit()

    with pytest.raises(Exception) as exc_info:
        _get_single_org_config(org.id, db_session)

    assert getattr(exc_info.value, "status_code", None) == 409
    assert "Duplicate organization configs found" in str(getattr(exc_info.value, "detail", ""))
