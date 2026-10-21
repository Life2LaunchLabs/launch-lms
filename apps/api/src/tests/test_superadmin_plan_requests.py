import pytest
from sqlmodel import Session, create_engine, select
from fastapi import HTTPException
from src.db.learning import BadgeIssuerAuthorization
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.plan_requests import PlanRequest, PlanRequestUpdate
from src.services.superadmin.orgs import OrgAccessUpdateRequest, _get_single_org_config, update_org_access, update_plan_request


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Organization.__table__.create(engine)
    OrganizationConfig.__table__.create(engine)
    PlanRequest.__table__.create(engine)
    BadgeIssuerAuthorization.__table__.create(engine)
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


def _request(session: Session, org_id: int, request_uuid: str, request_type: str, value: str) -> None:
    session.add(
        PlanRequest(
            org_id=org_id,
            request_uuid=request_uuid,
            request_type=request_type,
            requested_value=value,
            status="pending",
            creation_date="2026-01-01T00:00:00+00:00",
            update_date="2026-01-01T00:00:00+00:00",
        )
    )


def _free_org(session: Session) -> Organization:
    org = _create_org(session)
    session.add(
        OrganizationConfig(
            org_id=org.id,
            config={"config_version": "3.0", "tier": "free"},
            creation_date="2026-01-01T00:00:00+00:00",
            update_date="2026-01-01T00:00:00+00:00",
        )
    )
    return org


def _config(session: Session, org_id: int) -> dict:
    return session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).one().config


def test_tier_upgrade_approval_persists_the_tier(db_session: Session):
    org = _free_org(db_session)
    _request(db_session, org.id, "req_1", "tier_upgrade", "enterprise")
    db_session.commit()

    result = update_plan_request(db_session, "req_1", PlanRequestUpdate(status="approved"))

    org_config = db_session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org.id)).one()
    assert result.status == "approved"
    assert org_config.config["tier"] == "enterprise"
    assert org_config.update_date != "2026-01-01T00:00:00+00:00"


def test_partner_and_feature_approvals_add_to_the_config(db_session: Session):
    org = _free_org(db_session)
    _request(db_session, org.id, "partner", "partner_application", "badge_publisher")
    _request(db_session, org.id, "feature", "feature_request", "payments")
    db_session.commit()

    update_plan_request(db_session, "partner", PlanRequestUpdate(status="approved"))
    update_plan_request(db_session, "feature", PlanRequestUpdate(status="approved"))

    config = _config(db_session, org.id)
    assert config["tier"] == "free"
    assert config["partners"] == ["badge_publisher"]
    assert config["grants"] == {"payments": {"enabled": True}}


def test_denied_request_leaves_the_config_alone(db_session: Session):
    org = _free_org(db_session)
    _request(db_session, org.id, "req_1", "tier_upgrade", "full")
    db_session.commit()

    assert update_plan_request(db_session, "req_1", PlanRequestUpdate(status="denied")).status == "denied"
    assert _config(db_session, org.id) == {"config_version": "3.0", "tier": "free"}


def test_access_update_validates_partners_and_grants(db_session: Session):
    org = _free_org(db_session)
    db_session.commit()

    update_org_access(db_session, org.id, OrgAccessUpdateRequest(
        tier="full", partners=["plan_publisher"], grants={"learners": {"extra": 40}, "sso": {"enabled": True}, "groups": {"enabled": False}},
    ))
    config = _config(db_session, org.id)
    assert config["tier"] == "full" and config["partners"] == ["plan_publisher"]
    assert config["grants"] == {"learners": {"extra": 40}, "sso": {"enabled": True}}

    for bad in (OrgAccessUpdateRequest(partners=["reseller"]), OrgAccessUpdateRequest(grants={"boards": {"enabled": True}})):
        with pytest.raises(HTTPException) as exc_info:
            update_org_access(db_session, org.id, bad)
        assert exc_info.value.status_code == 422


def test_get_single_org_config_raises_when_duplicates_exist(db_session: Session):
    org = _create_org(db_session, org_id=2, slug="dupe")
    db_session.add(
        OrganizationConfig(
            org_id=org.id,
            config={"config_version": "3.0", "tier": "free"},
            creation_date="2026-01-01T00:00:00+00:00",
            update_date="2026-01-01T00:00:00+00:00",
        )
    )
    db_session.add(
        OrganizationConfig(
            org_id=org.id,
            config={"config_version": "3.0", "tier": "enterprise"},
            creation_date="2026-01-02T00:00:00+00:00",
            update_date="2026-01-02T00:00:00+00:00",
        )
    )
    db_session.commit()

    with pytest.raises(Exception) as exc_info:
        _get_single_org_config(org.id, db_session)

    assert getattr(exc_info.value, "status_code", None) == 409
    assert "Duplicate organization configs found" in str(getattr(exc_info.value, "detail", ""))
