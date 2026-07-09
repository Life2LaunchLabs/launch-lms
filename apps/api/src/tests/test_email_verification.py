import json
import time
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.organizations import Organization
from src.db.users import User
from src.services.users.email_verification import (
    NO_ORG_UUID,
    resend_verification_email,
    send_verification_email,
    verify_email_token,
)
from src.services.users.welcome_claim import (
    create_welcome_claim,
    resolve_welcome_claim,
)


class FakeRedis:
    """Minimal in-memory stand-in for the Redis client used by the service."""

    def __init__(self):
        self.store = {}

    def setex(self, key, ttl, value):
        self.store[key] = value

    def get(self, key):
        return self.store.get(key)

    def delete(self, *keys):
        for key in keys:
            self.store.pop(key, None)

    def scan_iter(self, match=None, count=None):
        prefix = match.rstrip("*")
        return [k for k in self.store if k.startswith(prefix)]


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Organization.__table__.create(engine)
    User.__table__.create(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture
def fake_redis():
    redis = FakeRedis()
    with patch(
        "src.services.users.email_verification.get_redis_connection",
        return_value=redis,
    ):
        yield redis


def _create_org(session: Session) -> Organization:
    org = Organization(
        id=1,
        org_uuid="org_1",
        name="Default",
        slug="default",
        email="default@example.com",
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )
    session.add(org)
    session.commit()
    return org


def _create_user(session: Session, *, verified: bool = False) -> User:
    user = User(
        id=1,
        user_uuid="user_1",
        username="user1",
        first_name="Test",
        last_name="User",
        email="user1@example.com",
        email_verified=verified,
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )
    session.add(user)
    session.commit()
    return user


@pytest.mark.asyncio
async def test_send_verification_email_stores_token_and_sends(
    db_session: Session, fake_redis: FakeRedis
):
    org = _create_org(db_session)
    user = _create_user(db_session)

    with patch(
        "src.services.users.email_verification.get_base_url_from_request",
        return_value="http://test",
    ), patch(
        "src.services.users.email_verification.send_email_verification_email",
        return_value=True,
    ) as mock_send:
        result = await send_verification_email(None, db_session, user, org.id)

    assert result == "Verification email sent"
    assert mock_send.call_count == 1
    assert len(fake_redis.store) == 1

    redis_key = next(iter(fake_redis.store))
    assert redis_key.startswith(f"email_verification:{user.user_uuid}:org:{org.org_uuid}:token:")
    data = json.loads(fake_redis.store[redis_key])
    assert data["user_uuid"] == user.user_uuid
    assert data["org_uuid"] == org.org_uuid
    assert data["email"] == user.email


@pytest.mark.asyncio
async def test_send_verification_email_without_org(
    db_session: Session, fake_redis: FakeRedis
):
    user = _create_user(db_session)

    with patch(
        "src.services.users.email_verification.get_base_url_from_request",
        return_value="http://test",
    ), patch(
        "src.services.users.email_verification.send_email_verification_email",
        return_value=True,
    ):
        result = await send_verification_email(None, db_session, user, org_id=None)

    assert result == "Verification email sent"
    redis_key = next(iter(fake_redis.store))
    assert f":org:{NO_ORG_UUID}:" in redis_key


@pytest.mark.asyncio
async def test_verify_email_token_marks_user_verified(
    db_session: Session, fake_redis: FakeRedis
):
    org = _create_org(db_session)
    user = _create_user(db_session)

    with patch(
        "src.services.users.email_verification.get_base_url_from_request",
        return_value="http://test",
    ), patch(
        "src.services.users.email_verification.send_email_verification_email",
        return_value=True,
    ):
        await send_verification_email(None, db_session, user, org.id)

    redis_key = next(iter(fake_redis.store))
    token = redis_key.rsplit(":token:", 1)[1]

    result = await verify_email_token(
        None, db_session, token, user.user_uuid, org.org_uuid
    )

    assert result == "Email verified successfully"
    refreshed = db_session.exec(select(User).where(User.id == user.id)).first()
    assert refreshed.email_verified is True
    assert refreshed.email_verified_at is not None
    # Token is single-use
    assert fake_redis.store == {}


@pytest.mark.asyncio
async def test_verify_email_token_rejects_invalid_token(
    db_session: Session, fake_redis: FakeRedis
):
    org = _create_org(db_session)
    user = _create_user(db_session)

    with pytest.raises(HTTPException) as exc_info:
        await verify_email_token(
            None, db_session, "not-a-real-token", user.user_uuid, org.org_uuid
        )

    assert exc_info.value.status_code == 400
    refreshed = db_session.exec(select(User).where(User.id == user.id)).first()
    assert refreshed.email_verified is False


@pytest.mark.asyncio
async def test_verify_email_token_rejects_expired_token(
    db_session: Session, fake_redis: FakeRedis
):
    org = _create_org(db_session)
    user = _create_user(db_session)

    redis_key = f"email_verification:{user.user_uuid}:org:{org.org_uuid}:token:tok"
    fake_redis.store[redis_key] = json.dumps(
        {
            "token": "tok",
            "user_uuid": user.user_uuid,
            "org_uuid": org.org_uuid,
            "email": user.email,
            "created_at": "2026-01-01T00:00:00+00:00",
            "expires_at": time.time() - 10,
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        await verify_email_token(
            None, db_session, "tok", user.user_uuid, org.org_uuid
        )

    assert exc_info.value.status_code == 400
    assert "expired" in exc_info.value.detail.lower()
    # Expired token is cleaned up
    assert fake_redis.store == {}


@pytest.mark.asyncio
async def test_verify_email_token_already_verified(
    db_session: Session, fake_redis: FakeRedis
):
    org = _create_org(db_session)
    user = _create_user(db_session, verified=True)

    redis_key = f"email_verification:{user.user_uuid}:org:{org.org_uuid}:token:tok"
    fake_redis.store[redis_key] = json.dumps(
        {
            "token": "tok",
            "user_uuid": user.user_uuid,
            "org_uuid": org.org_uuid,
            "email": user.email,
            "created_at": "2026-01-01T00:00:00+00:00",
            "expires_at": time.time() + 3600,
        }
    )

    result = await verify_email_token(
        None, db_session, "tok", user.user_uuid, org.org_uuid
    )

    assert result == "Email already verified"
    assert fake_redis.store == {}


@pytest.mark.asyncio
async def test_resend_verification_email_does_not_reveal_unknown_email(
    db_session: Session, fake_redis: FakeRedis
):
    with patch(
        "src.services.users.email_verification.check_verification_resend_rate_limit",
        return_value=(True, 0),
    ):
        result = await resend_verification_email(
            None, db_session, "nobody@example.com", org_id=None
        )

    assert "if an account" in result.lower()
    assert fake_redis.store == {}


@pytest.mark.asyncio
async def test_resend_verification_email_already_verified(
    db_session: Session, fake_redis: FakeRedis
):
    _create_user(db_session, verified=True)

    with patch(
        "src.services.users.email_verification.check_verification_resend_rate_limit",
        return_value=(True, 0),
    ):
        result = await resend_verification_email(
            None, db_session, "user1@example.com", org_id=None
        )

    assert result == "Email is already verified"


@pytest.mark.asyncio
async def test_resend_verification_email_rate_limited(
    db_session: Session, fake_redis: FakeRedis
):
    _create_user(db_session)

    with patch(
        "src.services.users.email_verification.check_verification_resend_rate_limit",
        return_value=(False, 600),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await resend_verification_email(
                None, db_session, "user1@example.com", org_id=None
            )

    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_resend_verification_email_sends_for_unverified_user(
    db_session: Session, fake_redis: FakeRedis
):
    org = _create_org(db_session)
    _create_user(db_session)

    with patch(
        "src.services.users.email_verification.check_verification_resend_rate_limit",
        return_value=(True, 0),
    ), patch(
        "src.services.users.email_verification.get_base_url_from_request",
        return_value="http://test",
    ), patch(
        "src.services.users.email_verification.send_email_verification_email",
        return_value=True,
    ) as mock_send:
        result = await resend_verification_email(
            None, db_session, "user1@example.com", org_id=org.id
        )

    assert "if an account" in result.lower()
    assert mock_send.call_count == 1
    assert len(fake_redis.store) == 1


@pytest.fixture
def fake_claim_redis():
    redis = FakeRedis()
    with patch(
        "src.services.users.welcome_claim.get_redis_connection",
        return_value=redis,
    ):
        yield redis


def test_welcome_claim_pending_until_verified(
    db_session: Session, fake_claim_redis: FakeRedis
):
    user = _create_user(db_session)

    token = create_welcome_claim(user.user_uuid, "/onboarding/activity")

    status, claimed_user, redirect_url = resolve_welcome_claim(db_session, token)
    assert status == "pending"
    assert claimed_user is None
    assert redirect_url is None
    # Token survives a pending poll
    assert len(fake_claim_redis.store) == 1

    user.email_verified = True
    db_session.add(user)
    db_session.commit()

    status, claimed_user, redirect_url = resolve_welcome_claim(db_session, token)
    assert status == "ready"
    assert claimed_user is not None
    assert claimed_user.user_uuid == user.user_uuid
    assert redirect_url == "/onboarding/activity"
    # Token is single-use
    assert fake_claim_redis.store == {}

    status, claimed_user, redirect_url = resolve_welcome_claim(db_session, token)
    assert status == "invalid"


def test_welcome_claim_unknown_token(
    db_session: Session, fake_claim_redis: FakeRedis
):
    status, claimed_user, redirect_url = resolve_welcome_claim(
        db_session, "not-a-real-token"
    )
    assert status == "invalid"
    assert claimed_user is None
    assert redirect_url is None


def test_welcome_claim_deleted_user(
    db_session: Session, fake_claim_redis: FakeRedis
):
    user = _create_user(db_session)
    token = create_welcome_claim(user.user_uuid, "/onboarding/activity")

    db_session.delete(user)
    db_session.commit()

    status, claimed_user, _ = resolve_welcome_claim(db_session, token)
    assert status == "invalid"
    assert claimed_user is None
    # Orphaned token is cleaned up
    assert fake_claim_redis.store == {}


def test_require_email_verification_env_var(monkeypatch):
    from config.config import get_launchlms_config

    monkeypatch.setenv("LAUNCHLMS_REQUIRE_EMAIL_VERIFICATION", "true")
    if hasattr(get_launchlms_config, "cache_clear"):
        get_launchlms_config.cache_clear()
    try:
        config = get_launchlms_config()
        assert config.general_config.require_email_verification is True
    finally:
        monkeypatch.delenv("LAUNCHLMS_REQUIRE_EMAIL_VERIFICATION")
        if hasattr(get_launchlms_config, "cache_clear"):
            get_launchlms_config.cache_clear()
