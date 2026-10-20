import importlib.util
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine

from src.db.organization_config import OrganizationConfig
from src.db.organization_invitations import OrganizationInvitation, OrganizationJoinLink
from src.db.organizations import Organization
from src.db.roles import Role, RoleTypeEnum
from src.db.user_organizations import UserOrganization
from src.security.access.access import (
    access_from_config,
    count_usage,
    ensure_feature,
    org_access,
    require_capacity,
    require_role_capacity,
)
from src.security.access.catalog import FEATURES

NOW = datetime.utcnow().replace(microsecond=0)
STAFF = {"dashboard": {"action_access": True}}


def _migration():
    path = Path(__file__).resolve().parents[3] / "migrations" / "versions" / "b3ee9e60e07c_org_access_tiers.py"
    spec = importlib.util.spec_from_file_location("org_access_tiers", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    for model in (Organization, OrganizationConfig, Role, UserOrganization, OrganizationInvitation, OrganizationJoinLink):
        model.__table__.create(engine)
    with Session(engine) as db_session:
        for org_id in (1, 2):
            db_session.add(Organization(id=org_id, org_uuid=f"org_{org_id}", name=f"Org {org_id}", slug=f"org-{org_id}", email=f"{org_id}@example.com", creation_date=NOW.isoformat(), update_date=NOW.isoformat()))
        db_session.add(Role(id=1, name="Admin", rights=STAFF, role_type=RoleTypeEnum.TYPE_GLOBAL, role_uuid="role_admin"))
        db_session.add(Role(id=4, name="Learner", rights={}, role_type=RoleTypeEnum.TYPE_GLOBAL, role_uuid="role_learner"))
        db_session.commit()
        yield db_session


def _config(session: Session, org_id: int, **config) -> None:
    session.add(OrganizationConfig(org_id=org_id, config={"config_version": "3.0", **config}))
    session.commit()


def _members(session: Session, org_id: int, role_id: int, count: int, start: int = 10) -> None:
    for user_id in range(start, start + count):
        session.add(UserOrganization(user_id=user_id, org_id=org_id, role_id=role_id, creation_date=NOW.isoformat(), update_date=NOW.isoformat()))
    session.commit()


def test_tiers_partners_and_grants_decide_features():
    free = access_from_config({"tier": "free"})
    assert not free.has("groups") and free.unlock("groups") == {"type": "tier_upgrade", "value": "full"}
    full = access_from_config({"tier": "full", "partners": ["badge_publisher", "reseller"], "grants": {"payments": {"enabled": True}}})
    assert full.has("groups") and full.has("bulk_invites") and not full.has("sso")
    assert full.has("badge_publishing") and full.partners == {"badge_publisher"}
    assert full.has("payments") and access_from_config({"tier": "enterprise"}).unlock("payments") == {"type": "feature_request", "value": "payments"}
    assert free.unlock("plan_publishing") == {"type": "partner_application", "value": "plan_publisher"}
    assert access_from_config({"tier": "nonsense"}).tier == "free"


def test_legacy_features_are_off_even_for_the_owner_and_grants():
    for key, spec in FEATURES.items():
        if spec.off:
            assert not access_from_config({"tier": "enterprise", "grants": {key: {"enabled": True}}}, owner=True).has(key)
            assert key not in access_from_config({}).to_dict()["features"]


def test_limits_add_grants_and_owner_is_unlimited():
    assert access_from_config({"tier": "free"}).limit("learners") == 25
    assert access_from_config({"tier": "full", "grants": {"staff_seats": {"extra": 3}}}).limit("staff_seats") == 15
    assert access_from_config({"tier": "enterprise", "grants": {"learners": {"extra": 3}}}).limit("learners") == 0
    assert access_from_config({"tier": "free"}, owner=True).limit("learners") == 0


def test_the_owner_org_has_every_feature(session: Session):
    _config(session, 1, tier="free")
    _config(session, 2, tier="free")
    assert org_access(1, session).owner and org_access(1, session).has("sso")
    with pytest.raises(HTTPException) as denied:
        ensure_feature(2, "sso", session)
    assert denied.value.status_code == 403 and "Enterprise" in denied.value.detail


def test_usage_counts_staff_and_learners_with_reservations(session: Session):
    _config(session, 2, tier="free")
    _members(session, 2, 1, 1)
    _members(session, 2, 4, 3, start=20)
    session.add(OrganizationInvitation(invitation_uuid="pending", org_id=2, email="a@example.com", email_normalized="a@example.com", role_id=4, expires_at=NOW + timedelta(days=5)))
    session.add(OrganizationInvitation(invitation_uuid="expired", org_id=2, email="b@example.com", email_normalized="b@example.com", role_id=4, expires_at=NOW - timedelta(days=5)))
    session.add(OrganizationJoinLink(link_uuid="link", token_hash="hash", org_id=2, role_id=4, max_redemptions=5, redemption_count=2, expires_at=NOW + timedelta(days=5), created_at=NOW))
    session.commit()

    assert count_usage("staff_seats", 2, session) == 1
    assert count_usage("learners", 2, session) == 3 + 1 + 3


def test_capacity_stops_at_the_limit(session: Session):
    _config(session, 2, tier="free", grants={"learners": {"extra": 1}})
    _members(session, 2, 1, 2)
    _members(session, 2, 4, 25, start=100)

    require_capacity("learners", 2, session)
    with pytest.raises(HTTPException) as too_many:
        require_capacity("learners", 2, session, adding=2)
    assert too_many.value.status_code == 403 and "26 active learners" in too_many.value.detail
    with pytest.raises(HTTPException):
        require_role_capacity(session.get(Role, 1), 2, session)


def test_migration_maps_plans_and_packages():
    migration = _migration()
    v2 = {
        "config_version": "2.0", "plan": "full", "packages": ["badge_creation", "analytics", "ai"],
        "overrides": {"members": {"extra_limit": 10}, "payments": {"enabled": True}},
        "admin_toggles": {"members": {"signup_mode": "inviteOnly"}},
        "customization": {"general": {"color": "#123"}}, "messaging": {"helper_approval": True},
    }
    document = migration.convert(v2, has_resources=True)
    assert document == {
        "config_version": "3.0", "active": True, "tier": "full",
        "partners": ["badge_publisher", "resource_partner"],
        "grants": {"advanced_reports": {"enabled": True}, "payments": {"enabled": True}, "learners": {"extra": 10}},
        "signup_mode": "inviteOnly",
        "customization": {"general": {"color": "#123"}}, "messaging": {"helper_approval": True},
    }
    assert migration.convert({"config_version": "2.0", "plan": "master"})["tier"] == "enterprise"
    assert migration.convert({"config_version": "2.0", "plan": "free"}, owner=True)["tier"] == "enterprise"
    assert migration.convert({"config_version": "2.0", "plan": "free"}, has_resources=True)["partners"] == []
    v1 = migration.convert({"config_version": "1.4", "cloud": {"plan": "enterprise"}, "general": {"enabled": True, "color": "#abc"}, "features": {"members": {"signup_mode": "inviteOnly"}}})
    assert (v1["tier"], v1["signup_mode"], v1["customization"]["general"]) == ("enterprise", "inviteOnly", {"color": "#abc"})
    assert migration.convert(document) == document


def test_migration_grants_orgs_already_over_their_limits():
    migration = _migration()
    document = migration.convert({"config_version": "2.0", "plan": "free"})
    over = migration.grant_overage(document, {"learners": 60, "staff_seats": 1})
    assert over["grants"] == {"learners": {"extra": 35}}
    assert migration.grant_overage({**document, "tier": "enterprise"}, {"learners": 9000})["grants"] == {}
