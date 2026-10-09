from types import SimpleNamespace

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import HTTPException, Response
import jwt

from src.routers import operations_surface as router


class Result:
    def __init__(self, value): self.value = value
    def first(self): return self.value


class Session:
    def __init__(self, organization): self.organization = organization
    def exec(self, _statement): return Result(self.organization)


def configure(monkeypatch):
    private = Ed25519PrivateKey.generate()
    pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    monkeypatch.setenv("LAUNCHLMS_OPERATIONS_SURFACE_ENABLED", "true")
    monkeypatch.setenv("LAUNCHLMS_OPERATIONS_ENVIRONMENT", "unstable")
    monkeypatch.setenv("LAUNCHLMS_OPERATIONS_SUBJECT_SECRET", "opaque-subject-secret-that-is-long-enough")
    monkeypatch.setenv("LAUNCHLMS_OPERATIONS_TOKEN_PRIVATE_KEY", pem)
    monkeypatch.setenv("LAUNCHLMS_OPERATIONS_TOKEN_KEY_ID", "launch-ops-2026-01")
    return private.public_key()


def test_session_is_short_lived_opaque_and_bound_to_nonce(monkeypatch):
    public = configure(monkeypatch)
    monkeypatch.setattr(router, "require_org_membership", lambda *_: None)
    monkeypatch.setattr(router, "get_user_org_role", lambda *_: SimpleNamespace(name="Learner"))
    nonce = "8bc4e4f2-073f-4eb7-86c4-82d4e96906b6"
    result = router.issue_operations_session(
        router.OperationsSessionRequest(nonce=nonce, protocol="launch-operations/v1", org_id=7),
        Response(), Session(SimpleNamespace(id=7, org_uuid="org-public-uuid")),
        SimpleNamespace(id=42, user_uuid="user-public-uuid", is_superadmin=False),
    )
    claims = jwt.decode(result["token"], public, algorithms=["EdDSA"], audience="launch-operations", issuer="launch-lms")
    assert claims["nonce"] == nonce
    assert claims["exp"] - claims["iat"] == 240
    assert claims["sub"] != "user-public-uuid" and claims["org"] != "org-public-uuid"
    assert set(claims) == {"iss", "aud", "project", "environment", "sub", "org", "role", "nonce", "iat", "exp"}


def test_production_and_invalid_nonce_are_rejected(monkeypatch):
    configure(monkeypatch)
    monkeypatch.setenv("LAUNCHLMS_OPERATIONS_ENVIRONMENT", "production")
    with __import__('pytest').raises(HTTPException) as error:
        router.issue_operations_session(router.OperationsSessionRequest(nonce="bad", protocol="launch-operations/v1", org_id=7), Response(), None, None)
    assert error.value.status_code == 404
    monkeypatch.setenv("LAUNCHLMS_OPERATIONS_ENVIRONMENT", "unstable")
    with __import__('pytest').raises(HTTPException) as error:
        router.issue_operations_session(router.OperationsSessionRequest(nonce="bad", protocol="launch-operations/v1", org_id=7), Response(), None, None)
    assert error.value.status_code == 422
