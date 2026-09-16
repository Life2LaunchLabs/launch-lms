"""Internal ticket exchange used by the web host-switch flow."""

from __future__ import annotations

import redis
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.users import User
from src.security.auth import (
    JWT_REFRESH_COOKIE_NAME,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
)
from src.services.auth.handoff import issue_ticket, redeem_ticket

router = APIRouter()


class HandoffRequest(BaseModel):
    target_host: str
    state: str
    return_path: str


class RedemptionRequest(HandoffRequest):
    ticket: str


@router.post("/handoff/issue")
def issue_handoff(request: Request, body: HandoffRequest, response: Response,
                  db_session: Session = Depends(get_db_session)):
    refresh = request.cookies.get(JWT_REFRESH_COOKIE_NAME)
    payload = decode_refresh_token(refresh) if refresh else None
    email = payload.get("sub") if payload else None
    if not email or not db_session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        ticket = issue_ticket(email, body.target_host, body.state, body.return_path)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except (redis.RedisError, RuntimeError) as error:
        raise HTTPException(status_code=503, detail="Session handoff unavailable") from error
    response.headers["Cache-Control"] = "no-store"
    return {"ticket": ticket}


@router.post("/handoff/redeem")
def redeem_handoff(body: RedemptionRequest, response: Response,
                   db_session: Session = Depends(get_db_session)):
    try:
        email = redeem_ticket(body.ticket, body.target_host, body.state, body.return_path)
    except (redis.RedisError, RuntimeError) as error:
        raise HTTPException(status_code=503, detail="Session handoff unavailable") from error
    if not email or not db_session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=401, detail="Invalid or expired handoff")
    response.headers["Cache-Control"] = "no-store"
    return {
        "access_token": create_access_token({"sub": email}),
        "refresh_token": create_refresh_token({"sub": email}),
    }
