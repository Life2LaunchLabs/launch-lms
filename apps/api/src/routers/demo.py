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
from src.security.auth import create_access_token, create_refresh_token, decode_jwt
from src.security.security import SECRET_KEY
from src.services.demo.access import claims, operator, visitor_credentials
from src.services.demo.configuration import DemoSettings, configuration, save_settings
from src.services.demo.cohort import (
    default_org,
    draft_accounts,
    pilot,
    public_pilots,
    validate_member,
)
from src.services.demo.lifecycle import (
    active_session,
    end,
    extend,
    preflight,
    publish,
    restore,
    admit,
    visitor_fingerprint,
)
from src.services.demo.namespaces import schema_signature
from src.routers.demo_guide import _environment
from src.services.demo.users import (
    AddExisting,
    CreateDemoUser,
    UpdateDemoUser,
    add_existing,
    create_demo_user,
    mark_setup,
    remove_demo_user,
    update_demo_user,
)
from src.services.security.rate_limiting import check_rate_limit, get_client_ip

router = APIRouter()


def control_db():
    with Session(engine) as db:
        yield db


class PilotSelection(BaseModel):
    user_id: int | None = Field(default=None, gt=0)
    # Optional label from a shared link, e.g. ?tag=oct-fair.
    tag: str | None = Field(default=None, max_length=40, pattern="^[A-Za-z0-9_-]*$")


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


def _published_at(db: Session, checkpoint_id: str | None):
    checkpoint = checkpoint_info(db, checkpoint_id) if checkpoint_id else None
    return checkpoint.created_at if checkpoint else None


@router.get("/status")
def status(request: Request, db: Session = Depends(control_db)):
    config = configuration(db)
    payload = claims(request)
    if payload.get("demo_session"):
        session = active_session(db, payload["demo_session"])
        checkpoint = checkpoint_info(db, session.checkpoint_id)
        account = pilot(db, checkpoint, session.pilot_user_id, pickable=False)
        member = db.get(DemoMember, session.pilot_user_id)
        return {
            "mode": "visitor",
            "expires_at": session.expires_at.isoformat() + "Z",
            "checkpoint_id": session.checkpoint_id,
            "pilot_user_id": session.pilot_user_id,
            "entry_org_slug": checkpoint.entry_org_slug,
            "start_path": account["start_path"],
            "start_org_slug": account["start_org_slug"],
            "tag": session.tag,
            "accounts": public_pilots(db, checkpoint),
            "pilot": {
                **{key: value for key, value in account.items() if key != "email"},
                "role_line": member.role_line if member else "",
                "description": member.description if member else "",
                "handle": member.handle if member else None,
            },
            **_environment(),
        }
    if payload.get("sub"):
        try:
            actor = operator(request, db)
        except HTTPException:
            pass
        else:
            published_at = _published_at(db, config.checkpoint_id)
            setup_user = None
            if payload.get("demo_operator"):
                target = db.exec(
                    select(User).where(User.email == payload.get("sub"))
                ).first()
                setup_user = target.id if target else None
            return {
                "mode": "admin" if payload.get("demo_operator") else "operator",
                "checkpoint_id": config.checkpoint_id,
                "settings": config.model_dump(
                    exclude={"entry_org_id", "recapture_error_signature"}
                ),
                "actor_id": actor.id,
                "setup_user_id": setup_user,
                "main_org_slug": default_org(db).slug,
                "members": draft_accounts(db, published_at),
                "accounts": public_pilots(db, checkpoint_info(db, config.checkpoint_id))
                if config.checkpoint_id
                else [],
                "ready_workspaces": db.exec(
                    select(func.count())
                    .select_from(DemoSession)
                    .where(
                        DemoSession.state == "available",
                        DemoSession.checkpoint_id == config.checkpoint_id,
                        DemoSession.ended_at.is_(None),
                    )
                ).one(),
                "active_sessions": db.exec(
                    select(func.count())
                    .select_from(DemoSession)
                    .where(
                        DemoSession.state == "active",
                        DemoSession.visitor_id != "",
                        DemoSession.ended_at.is_(None),
                        DemoSession.expires_at > datetime.utcnow(),
                    )
                ).one(),
                "published_at": published_at.isoformat() + "Z"
                if published_at
                else None,
                **_environment(),
            }
    published = config.enabled and config.checkpoint_id
    return {
        "mode": "public",
        "accounts": public_pilots(db, checkpoint_info(db, config.checkpoint_id))
        if published
        else [],
        "checkpoint_id": config.checkpoint_id if published else None,
        "available": bool(published),
        "preparing": bool(pending_id(request)),
        "unstable": _environment()["unstable"],
    }


@router.put("/settings")
def settings(request: Request, body: DemoSettings, db: Session = Depends(control_db)):
    operator(request, db)
    return save_settings(db, body)


@router.get("/users")
def list_users(request: Request, db: Session = Depends(control_db)):
    operator(request, db)
    config = configuration(db)
    return draft_accounts(db, _published_at(db, config.checkpoint_id))


@router.post("/users", status_code=201)
def create_user(
    request: Request, body: CreateDemoUser, db: Session = Depends(control_db)
):
    actor = operator(request, db)
    return create_demo_user(db, actor.id, body)


@router.post("/users/existing", status_code=201)
def add_existing_user(
    request: Request, body: AddExisting, db: Session = Depends(control_db)
):
    operator(request, db)
    return add_existing(db, body)


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    request: Request,
    body: UpdateDemoUser,
    db: Session = Depends(control_db),
):
    operator(request, db)
    return update_demo_user(db, user_id, body)


@router.delete("/users/{user_id}")
def remove_user(user_id: int, request: Request, db: Session = Depends(control_db)):
    operator(request, db)
    remove_demo_user(db, user_id)
    return {"removed": True}


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
    member = db.get(DemoMember, body.user_id) if body.user_id else None
    if not member:
        raise HTTPException(422, "Choose one of the demo users.")
    source = validate_member(db, db.get(User, body.user_id))
    mark_setup(db, source.id)
    payload = {"sub": source.email, "demo_operator": actor.id}
    return {
        "tokens": {
            "access_token": create_access_token(payload),
            "refresh_token": create_refresh_token(payload, timedelta(hours=8)),
            "entry_org_slug": default_org(db).slug,
            "start_path": member.start_path,
            "start_org_slug": member.start_org_slug,
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


@router.get("/preflight")
def check_publish(request: Request):
    with Session(engine.execution_options(isolation_level="REPEATABLE READ")) as db:
        operator(request, db)
        return preflight(db)


@router.get("/checkpoints")
def history(request: Request, db: Session = Depends(control_db)):
    operator(request, db)
    config = configuration(db)
    rows = db.exec(
        select(
            DemoCheckpoint.id,
            DemoCheckpoint.created_at,
            DemoCheckpoint.created_by,
            DemoCheckpoint.schema_signature,
        )
        .order_by(DemoCheckpoint.created_at.desc())
        .limit(15)
    ).all()
    authors = {
        user.id: f"{user.first_name} {user.last_name}".strip() or user.username
        for user in db.exec(
            select(User).where(User.id.in_({row.created_by for row in rows}))
        ).all()
    }
    signature = schema_signature()
    return [
        {
            "id": row.id,
            "published_at": row.created_at.isoformat() + "Z",
            "published_by": authors.get(row.created_by, "Unknown"),
            "current": row.id == config.checkpoint_id,
            "compatible": row.schema_signature == signature,
        }
        for row in rows
    ]


@router.post("/checkpoints/{checkpoint_id}/restore")
def restore_checkpoint(
    checkpoint_id: str,
    request: Request,
    body: Revision,
    db: Session = Depends(control_db),
):
    operator(request, db)
    result = restore(db, checkpoint_id, body.revision)
    return {"checkpoint_id": result.id}


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
                "A demo account changed while publishing. Publish again.",
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
    session = admit(db, fingerprint, body.user_id, replacing, body.tag or None)
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
        db,
        session.visitor_id,
        session.pilot_user_id,
        replacing=(session.id,),
        tag=session.tag,
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
