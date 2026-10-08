"""Never treat a visitor credential as a live-account credential."""

from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from sqlmodel import Session
from src.services.demo.metadata import checkpoint_info
from src.db.users import PublicUser, User
from src.security.auth import (
    create_access_token,
    create_refresh_token,
    decode_jwt,
    extract_jwt_from_request,
)
from src.security.superadmin import is_user_owner_org_admin, is_user_superadmin
from src.services.demo.lifecycle import active_session


def claims(request: Request) -> dict:
    token = extract_jwt_from_request(request)
    return (decode_jwt(token) if token else None) or {}


def operator(request: Request, db: Session) -> User:
    payload = claims(request)
    if payload.get("demo_session"):
        raise HTTPException(403, "Visitors cannot manage the demo.")
    actor = payload.get("demo_operator")
    if actor:
        user = db.get(User, int(actor))
    else:
        from sqlmodel import select

        user = db.exec(select(User).where(User.email == payload.get("sub"))).first()
    if not user or not (
        is_user_superadmin(user.id, db) or is_user_owner_org_admin(user.id, db)
    ):
        raise HTTPException(
            403, "Platform admin access is required to manage the demo."
        )
    return user


def visitor_credentials(db: Session, identifier: str) -> dict:
    session = active_session(db, identifier)
    checkpoint = checkpoint_info(db, session.checkpoint_id)
    from src.services.demo.cohort import pilot

    account = pilot(db, checkpoint, session.pilot_user_id, pickable=False)
    email = account["email"]
    payload = {
        "sub": email,
        "demo_session": identifier,
        "demo_user": account["user_id"],
    }
    # Session expiry/revocation is authoritative; extensions need no cookie changes.
    return {
        "access_token": create_access_token(payload, timedelta(days=30)),
        "refresh_token": create_refresh_token(payload),
        "expiry": int((datetime.utcnow() + timedelta(days=30)).timestamp() * 1000),
        "entry_org_slug": checkpoint.entry_org_slug,
        "start_path": account["start_path"],
        "start_org_slug": account["start_org_slug"],
    }


def session_user(db: Session, payload: dict) -> PublicUser:
    user = db.get(User, payload.get("demo_user"))
    if not user:
        raise HTTPException(401, "The demo account is unavailable.")
    return PublicUser(**user.model_dump())
