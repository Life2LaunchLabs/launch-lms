from datetime import datetime, timedelta
from uuid import uuid4
from base64 import b64decode

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import OperationalError
from sqlmodel import Session, select, func
from src.core.events.database import engine
from src.db.demo import DemoCheckpoint, DemoSession, DemoMember
from src.services.demo.metadata import checkpoint_info
from src.db.users import User
from src.db.organizations import Organization
from src.security.auth import create_access_token, create_refresh_token, decode_jwt
from src.security.security import SECRET_KEY
from src.services.demo.access import claims, operator, visitor_credentials
from src.services.demo.clone import CloneRequest, clone_account
from src.services.demo.configuration import DemoSettings, configuration, save_settings
from src.services.demo.cohort import (
    CohortSettings,
    save_cohort,
    draft_accounts,
    public_pilots,
    validate_member,
)
from src.services.demo.lifecycle import (
    active_session,
    end,
    extend,
    publish,
    admit,
    visitor_fingerprint,
)
from src.services.security.rate_limiting import check_rate_limit, get_client_ip

router = APIRouter()


def control_db():
    with Session(engine) as db:
        yield db


class PilotSelection(BaseModel):
    user_id: int | None = Field(default=None, gt=0)


class Revision(BaseModel):
    revision: int = Field(ge=1)


def visitor_id(request: Request) -> str:
    payload = claims(request)
    identifier = payload.get("demo_session")
    if not identifier:
        raise HTTPException(401, "Start a demo session first.")
    return identifier


def pending_id(request: Request) -> str | None:
    ticket = decode_jwt(request.cookies.get("demo_pending_cookie", "")) or {}
    return (
        ticket.get("demo_pending") if ticket.get("purpose") == "demo_pending" else None
    )


def pending_ticket(session: DemoSession) -> dict:
    return {
        "preparing": True,
        "pending_token": create_access_token(
            {
                "sub": session.visitor_id,
                "purpose": "demo_pending",
                "demo_pending": session.id,
            },
            timedelta(minutes=15),
        ),
    }


@router.get("/status")
def status(request: Request, db: Session = Depends(control_db)):
    config = configuration(db)
    payload = claims(request)
    if payload.get("demo_session"):
        session = active_session(db, payload["demo_session"])
        return {
            "mode": "visitor",
            "expires_at": session.expires_at.isoformat() + "Z",
            "checkpoint_id": session.checkpoint_id,
            "pilot_user_id": session.pilot_user_id,
            "entry_org_slug": checkpoint_info(db, session.checkpoint_id).entry_org_slug,
        }
    if payload.get("sub"):
        try:
            actor = operator(request, db)
        except HTTPException:
            pass
        else:
            checkpoint = (
                checkpoint_info(db, config.checkpoint_id)
                if config.checkpoint_id
                else None
            )
            return {
                "mode": "admin" if payload.get("demo_operator") else "operator",
                "checkpoint_id": config.checkpoint_id,
                "settings": {
                    **config.model_dump(),
                    "entry_org_slug": db.get(Organization, config.entry_org_id).slug
                    if config.entry_org_id
                    else "",
                },
                "actor_id": actor.id,
                "members": draft_accounts(db),
                "accounts": public_pilots(checkpoint),
                "ready_workspaces": db.exec(
                    select(func.count())
                    .select_from(DemoSession)
                    .where(
                        DemoSession.state == "available",
                        DemoSession.checkpoint_id == config.checkpoint_id,
                        DemoSession.ended_at.is_(None),
                    )
                ).one(),
                "published_at": checkpoint.created_at.isoformat() + "Z"
                if checkpoint
                else None,
            }
    return {
        "mode": "public",
        "accounts": public_pilots(checkpoint_info(db, config.checkpoint_id))
        if config.enabled
        else [],
        "checkpoint_id": config.checkpoint_id if config.enabled else None,
        "available": bool(config.enabled and config.checkpoint_id),
        "preparing": bool(pending_id(request)),
    }


@router.put("/settings")
def settings(request: Request, body: DemoSettings, db: Session = Depends(control_db)):
    operator(request, db)
    return save_settings(db, body)


@router.put("/cohort")
def cohort_settings(
    request: Request, body: CohortSettings, db: Session = Depends(control_db)
):
    operator(request, db)
    return save_cohort(db, body)


@router.post("/cohort/clone")
def clone_member(
    request: Request, body: CloneRequest, db: Session = Depends(control_db)
):
    actor = operator(request, db)
    return clone_account(db, actor.id, body)


@router.get("/portraits/{checkpoint_id}/{user_id}")
def portrait(checkpoint_id: str, user_id: int, db: Session = Depends(control_db)):
    # Public like the selection page; checkpoint ids are immutable, so cache hard.
    portraits = db.exec(
        select(DemoCheckpoint.portraits).where(DemoCheckpoint.id == checkpoint_id)
    ).first()
    header, _, encoded = (portraits or {}).get(str(user_id), "").partition(",")
    if not encoded:
        raise HTTPException(404, "No portrait.")
    return Response(
        b64decode(encoded),
        media_type=header.removeprefix("data:").removesuffix(";base64"),
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/admin/enter")
def enter_admin(
    request: Request,
    body: PilotSelection = PilotSelection(),
    db: Session = Depends(control_db),
):
    actor = operator(request, db)
    config = configuration(db)
    if body.user_id is None or not db.get(DemoMember, body.user_id):
        raise HTTPException(
            422, "Choose an account in the designated fictional cohort."
        )
    source = validate_member(db, db.get(User, body.user_id), config.entry_org_id)
    payload = {"sub": source.email, "demo_operator": actor.id}
    return {
        "tokens": {
            "access_token": create_access_token(payload),
            "refresh_token": create_refresh_token(payload, timedelta(hours=8)),
            "entry_org_slug": db.get(Organization, config.entry_org_id).slug,
        }
    }


@router.post("/admin/exit")
def exit_admin(request: Request, db: Session = Depends(control_db)):
    actor = operator(request, db)
    return {
        "tokens": {
            "access_token": create_access_token({"sub": actor.email}),
            "refresh_token": create_refresh_token({"sub": actor.email}),
        }
    }


@router.post("/checkpoints")
def checkpoint(request: Request, body: Revision):
    # A stable transaction prevents org edits halfway through an export.
    with Session(engine.execution_options(isolation_level="REPEATABLE READ")) as db:
        actor = operator(request, db)
        try:
            result = publish(db, actor.id, body.revision)
        except OperationalError as error:
            if getattr(error.orig, "pgcode", None) != "40001":
                raise
            raise HTTPException(
                409,
                "The live account changed while publishing. Reload and save the checkpoint again.",
            ) from None
        return {
            "checkpoint_id": result.id,
            "published_at": result.created_at.isoformat() + "Z",
        }


@router.post("/start", status_code=202)
def start_session(
    request: Request,
    body: PilotSelection = PilotSelection(),
    db: Session = Depends(control_db),
):
    network = visitor_fingerprint(get_client_ip(request), SECRET_KEY)
    visitor = decode_jwt(request.cookies.get("demo_visitor_cookie", "")) or {}
    fingerprint = (
        visitor.get("sub") if visitor.get("purpose") == "demo_visitor" else uuid4().hex
    )
    visitor_token = create_access_token(
        {"sub": fingerprint, "purpose": "demo_visitor"}, timedelta(days=1)
    )
    allowed, _, retry = check_rate_limit(f"demo-start:{network}", 600, 60)
    if not allowed:
        raise HTTPException(
            429,
            "Please wait before starting another demo.",
            headers={"Retry-After": str(retry)},
        )
    replacing = tuple(
        identifier
        for identifier in (claims(request).get("demo_session"), pending_id(request))
        if identifier
    )
    session = admit(db, fingerprint, body.user_id, replacing)
    return {**pending_ticket(session), "visitor_token": visitor_token}


@router.get("/ready")
def ready(request: Request, db: Session = Depends(control_db)):
    identifier = pending_id(request)
    session = db.get(DemoSession, identifier) if identifier else None
    if not session:
        raise HTTPException(401, "Start a demo session first.")
    if (
        session.ended_at
        or session.expires_at <= datetime.utcnow()
        or session.state == "failed"
    ):
        raise HTTPException(
            503, session.error or "Demo preparation ended. Please start again."
        )
    if session.state != "active":
        return {"preparing": True}
    return {"tokens": visitor_credentials(db, session.id)}


@router.post("/reset", status_code=202)
def reset_session(request: Request, db: Session = Depends(control_db)):
    session = active_session(db, visitor_id(request))
    replacement = admit(
        db, session.visitor_id, session.pilot_user_id, replacing=(session.id,)
    )
    return pending_ticket(replacement)


@router.post("/end")
def end_session(request: Request, db: Session = Depends(control_db)):
    end(
        db,
        claims(request).get("demo_session")
        or pending_id(request)
        or visitor_id(request),
    )
    return {"ended": True}


@router.post("/extend")
def extend_session(request: Request, db: Session = Depends(control_db)):
    session = extend(db, visitor_id(request))
    return {"expires_at": session.expires_at.isoformat() + "Z"}
