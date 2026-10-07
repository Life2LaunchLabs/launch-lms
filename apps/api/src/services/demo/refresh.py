from fastapi import HTTPException, Request, Response
from sqlmodel import Session
from src.core.events.database import engine
from src.db.users import User
from src.security.auth import create_access_token
from src.security.superadmin import is_user_owner_org_admin, is_user_superadmin
from src.services.demo.access import visitor_credentials


def refresh_demo(
    request: Request, response: Response, payload: dict, set_cookies, expiry_ms
) -> dict | None:
    if payload.get("demo_session"):
        with Session(engine) as control:
            credentials = visitor_credentials(control, payload["demo_session"])
        set_cookies(
            response, credentials["access_token"], credentials["refresh_token"], request
        )
        return credentials
    if payload.get("demo_operator"):
        with Session(engine) as control:
            actor = control.get(User, payload["demo_operator"])
            if not actor or not (
                is_user_superadmin(actor.id, control)
                or is_user_owner_org_admin(actor.id, control)
            ):
                raise HTTPException(403, "Platform admin access is required.")
        access = create_access_token({"sub": payload["sub"], "demo_operator": actor.id})
        return {"access_token": access, "expiry": expiry_ms()}
    return None


def revoke_demo(token: str) -> None:
    from src.security.auth import decode_jwt
    from src.services.demo.lifecycle import end

    payload = decode_jwt(token) or {}
    if payload.get("demo_session"):
        with Session(engine) as control:
            end(control, payload["demo_session"])
