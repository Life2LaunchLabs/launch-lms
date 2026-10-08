"""Serialized admission, immutable publication, revocation and retryable cleanup."""

import hashlib
import logging
import time
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, case
from sqlmodel import Session, select
from src.db.demo import DemoCheckpoint, DemoSession
from src.db.users import User
from src.services.demo.checkpoints import capture
from src.services.demo.configuration import configuration
from src.services.demo.media import capture_files, write_files, clean_files
from src.services.demo.namespaces import (
    drop_namespace,
    materialize,
    remap,
    schema_signature,
)
from src.services.demo.rehearsal import describe, rehearse

logger = logging.getLogger(__name__)


def build(db: Session) -> dict:
    """Capture the demo world as it is now. Raises HTTPException for blockers."""
    from src.services.demo.cohort import default_org, members, validate_member, identity

    cohort = members(db)
    if not cohort or not any(member.pilotable for member in cohort):
        raise HTTPException(
            422, "Add demo users and show at least one on the picker first."
        )
    main = default_org(db)
    users = {
        member.user_id: validate_member(db, db.get(User, member.user_id))
        for member in cohort
    }
    rows = capture(db, main.id, set(users))
    warnings: list[dict] = []
    files = capture_files(rows, set(users), warnings)
    from src.services.demo.portraits import published_portrait

    pilots, portraits = {}, {}
    # Every demo user is published; whether visitors can pick one is read live.
    for member in cohort:
        user = users[member.user_id]
        portrait = published_portrait(user, files)
        if portrait:
            portraits[str(user.id)] = portrait
        pilots[str(user.id)] = {
            **identity(user),
            "email": user.email,
            "has_avatar": bool(portrait),
        }
    return {
        "main": main,
        "users": users,
        "rows": rows,
        "files": files,
        "warnings": warnings,
        "pilots": pilots,
        "portraits": portraits,
    }


def summarize(world: dict) -> dict:
    rows, users = world["rows"], world["users"]

    def count(table, field, user_id):
        return sum(1 for row in rows.get(table, []) if row.get(field) == user_id)

    portfolios = {row["id"]: row["user_id"] for row in rows.get("portfolio", [])}
    member_of = {
        (row["user_id"], row["org_id"]) for row in rows.get("userorganization", [])
    }
    people = []
    warnings = list(world["warnings"])
    for user_id, user in users.items():
        if (user_id, world["main"].id) not in member_of:
            warnings.append(
                {
                    "kind": "not_in_main_org",
                    "user_id": user_id,
                    "message": f"{user.first_name} {user.last_name}".strip()
                    + f" is not a member of {world['main'].name}, so the main portal treats them as a guest.",
                }
            )
        people.append(
            {
                "user_id": user_id,
                "name": f"{user.first_name} {user.last_name}".strip() or user.username,
                "badges": count("learningbadgeaward", "user_id", user_id),
                "badge_runs": count("learningrun", "user_id", user_id),
                "projects": sum(
                    1
                    for row in rows.get("projectitem", [])
                    if portfolios.get(row["portfolio_id"]) == user_id
                ),
                "plans": count("plan", "subject_user_id", user_id),
                "conversations": count("hubconversation", "user_id", user_id),
            }
        )
    return {
        "users": people,
        "warnings": warnings,
        "records": sum(len(records) for records in rows.values()),
        "files": len(world["files"]),
        "bytes": sum(len(encoded) * 3 // 4 for encoded in world["files"].values()),
        "organizations": sorted(row["name"] for row in rows.get("organization", [])),
    }


def preflight(db: Session) -> dict:
    """Run the publish capture without saving anything."""
    try:
        world = build(db)
    except HTTPException as error:
        return {"ok": False, "error": str(error.detail), "users": [], "warnings": []}
    finally:
        db.rollback()
    return {"ok": True, "error": None, **summarize(world)}


def publish(db: Session, actor_id: int, revision: int) -> DemoCheckpoint:
    config = configuration(db, lock=True)
    if config.revision != revision:
        raise HTTPException(
            409, "The demo changed since you loaded this page. Reload, then publish."
        )
    # Publication captures one database transaction; callers use REPEATABLE READ.
    world = build(db)
    rehearse(db.get_bind(), world["rows"], world["files"])
    checkpoint = DemoCheckpoint(
        id=uuid4().hex,
        schema_signature=schema_signature(),
        created_by=actor_id,
        entry_org_slug=world["main"].slug,
        pilots=world["pilots"],
        portraits=world["portraits"],
        data={
            "schema": schema_signature(),
            "rows": world["rows"],
            "files": world["files"],
            "summary": summarize(world),
        },
    )
    db.add(checkpoint)
    config.checkpoint_id = checkpoint.id
    config.recapture_error = config.recapture_error_signature = None
    config.revision += 1
    db.add(config)
    db.commit()
    db.refresh(checkpoint, attribute_names=["id", "created_at"])
    return checkpoint


def restore(db: Session, checkpoint_id: str, revision: int) -> DemoCheckpoint:
    """Point new visits at an earlier published version."""
    config = configuration(db, lock=True)
    if config.revision != revision:
        raise HTTPException(
            409, "The demo changed since you loaded this page. Reload, then try again."
        )
    from src.services.demo.metadata import checkpoint_info

    checkpoint = checkpoint_info(db, checkpoint_id)
    if not checkpoint:
        raise HTTPException(404, "That version no longer exists.")
    if checkpoint.schema_signature != schema_signature():
        raise HTTPException(
            422,
            "That version was published before a product update and can no longer be used. Publish a new one instead.",
        )
    config.checkpoint_id = checkpoint.id
    config.revision += 1
    db.add(config)
    db.commit()
    return checkpoint


def active_session(db: Session, identifier: str, *, lock: bool = False) -> DemoSession:
    statement = select(DemoSession).where(DemoSession.id == identifier)
    if lock:
        statement = statement.with_for_update()
    session = db.exec(statement).first()
    if (
        not session
        or session.state != "active"
        or session.ended_at
        or session.expires_at <= datetime.utcnow()
    ):
        raise HTTPException(401, "Your demo session has ended. Start a new demo.")
    return session


def admit(
    db: Session,
    visitor_id: str,
    pilot_user_id: int | None = None,
    replacing: tuple[str, ...] = (),
    tag: str | None = None,
) -> DemoSession:
    """Admit a visitor; sessions in `replacing` end only if admission succeeds."""
    config = configuration(db, lock=True)
    if not config.enabled or not config.checkpoint_id:
        raise HTTPException(
            503, "The demo is not available yet. Please try again later."
        )
    from src.services.demo.metadata import checkpoint_info

    checkpoint = checkpoint_info(db, config.checkpoint_id)
    if not checkpoint:
        raise HTTPException(503, "The demo checkpoint is unavailable.")
    from src.services.demo.cohort import pilot

    account = pilot(db, checkpoint, pilot_user_id)
    if checkpoint.schema_signature != schema_signature():
        raise HTTPException(
            503,
            "The demo needs a fresh checkpoint after this product update. Please try again later.",
        )
    # Revoking inside this transaction frees capacity for the replacement, and an
    # admission failure above or below rolls the revocation back with it.
    for previous in db.exec(
        select(DemoSession)
        .where(DemoSession.id.in_(replacing), DemoSession.ended_at.is_(None))
        .with_for_update()
    ).all():
        previous.ended_at, previous.state = datetime.utcnow(), "ended"
        db.add(previous)
    db.flush()
    # Preparing sessions count toward capacity. Publication and admission share a row lock.
    count = db.exec(
        select(func.count())
        .select_from(DemoSession)
        .where(
            DemoSession.state.in_(["preparing", "provisioning", "active"]),
            DemoSession.visitor_id != "",
            DemoSession.ended_at.is_(None),
            DemoSession.expires_at > datetime.utcnow(),
        )
    ).one()
    if count >= config.capacity:
        raise HTTPException(
            503,
            "The demo is busy. Please try again shortly.",
            headers={"Retry-After": "30"},
        )
    warmed = db.exec(
        select(DemoSession)
        .where(
            DemoSession.checkpoint_id == checkpoint.id,
            DemoSession.visitor_id == "",
            DemoSession.state.in_(["available", "preparing", "provisioning"]),
            DemoSession.ended_at.is_(None),
            DemoSession.expires_at > datetime.utcnow(),
            DemoSession.schema_signature == schema_signature(),
        )
        .order_by(
            case((DemoSession.state == "available", 0), else_=1), DemoSession.created_at
        )
        .with_for_update(skip_locked=True)
    ).first()
    if warmed:
        warmed.visitor_id = visitor_id
        warmed.pilot_user_id = account["user_id"]
        warmed.tag = tag
        warmed.duration_minutes = config.session_minutes
        warmed.expires_at = datetime.utcnow() + timedelta(
            minutes=config.session_minutes if warmed.state == "available" else 15
        )
        if warmed.state == "available":
            warmed.state = "active"
        db.add(warmed)
        db.commit()
        db.refresh(warmed)
        return warmed
    identifier = uuid4().hex
    session = DemoSession(
        id=identifier,
        namespace=f"demo_{identifier}",
        schema_signature=schema_signature(),
        checkpoint_id=checkpoint.id,
        visitor_id=visitor_id,
        pilot_user_id=account["user_id"],
        tag=tag,
        duration_minutes=config.session_minutes,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def prepare(engine, identifier: str) -> bool:
    """An advisory lease lets another worker resume an interrupted preparation."""
    from sqlalchemy import text

    key = int(identifier[:15], 16)
    with engine.connect() as lease:
        acquired = lease.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": key}
        ).scalar()
        lease.commit()
        if not acquired:
            return False
        try:
            with Session(lease, expire_on_commit=False) as db:
                session = db.get(DemoSession, identifier)
                if (
                    not session
                    or session.ended_at
                    or session.expires_at <= datetime.utcnow()
                ):
                    return False
                if session.state == "active":
                    return True
                if session.state not in {"preparing", "provisioning"}:
                    return False
                retry = session.state == "provisioning"
                checkpoint = db.get(DemoCheckpoint, session.checkpoint_id)
                if not checkpoint or session.schema_signature != schema_signature():
                    session.state = "failed"
                    session.ended_at = datetime.utcnow()
                    session.error = (
                        "A new checkpoint is required after this product update."
                    )
                    db.add(session)
                    db.commit()
                    return False
                files = checkpoint.data["files"]
                data, identifiers = remap(checkpoint.data["rows"], identifier, files)
                session.aliases = identifiers
                session.state = "provisioning"
                db.add(session)
                db.commit()
                try:
                    if retry:
                        drop_namespace(engine, session.namespace)
                        clean_files(identifier)
                    materialize(engine, session.namespace, data)
                    write_files(files, identifiers)
                except Exception as error:
                    db.rollback()
                    db.refresh(session)
                    session.state = "failed"
                    session.ended_at = session.ended_at or datetime.utcnow()
                    session.error = "Workspace preparation failed. Please start again."
                    # Visitors see `error`; Demo Studio shows the cause.
                    session.failure_detail = describe(error)
                    db.add(session)
                    db.commit()
                    logger.exception(
                        "Demo workspace preparation failed session=%s", identifier
                    )
                    return False
                db.refresh(session, with_for_update=True)
                if session.ended_at or session.expires_at <= datetime.utcnow():
                    return False
                session.state = "active" if session.visitor_id else "available"
                session.expires_at = datetime.utcnow() + timedelta(
                    minutes=session.duration_minutes if session.visitor_id else 2880
                )
                db.add(session)
                db.commit()
                return True
        finally:
            lease.rollback()
            lease.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": key})
            lease.commit()


def start(
    db: Session, engine, visitor_id: str, pilot_user_id: int | None = None
) -> DemoSession:
    """Blocking composition used by internal probes; HTTP admission stays quick."""
    session = admit(db, visitor_id, pilot_user_id)
    identifier = session.id
    db.rollback()
    deadline = time.monotonic() + 900
    while not prepare(engine, identifier):
        db.expire_all()
        pending = db.get(DemoSession, identifier)
        if pending and pending.state == "active" and not pending.ended_at:
            break
        if (
            not pending
            or pending.ended_at
            or pending.expires_at <= datetime.utcnow()
            or time.monotonic() >= deadline
        ):
            raise HTTPException(
                503, "We could not prepare your demo. Please try again."
            )
        db.rollback()
        time.sleep(0.1)
    db.expire_all()
    return active_session(db, identifier)


def end(db: Session, identifier: str) -> None:
    session = db.exec(
        select(DemoSession).where(DemoSession.id == identifier).with_for_update()
    ).first()
    if session and not session.ended_at:
        session.ended_at = datetime.utcnow()
        session.state = "ended"
        db.add(session)
        db.commit()


def extend(db: Session, identifier: str) -> DemoSession:
    config = configuration(db)
    session = active_session(db, identifier, lock=True)
    # An extension grants another interval from now, rather than accumulating time.
    session.expires_at = max(
        session.expires_at,
        datetime.utcnow() + timedelta(minutes=config.extension_minutes),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def cleanup(db: Session, engine) -> int:
    now = datetime.utcnow()
    identifiers = db.exec(
        select(DemoSession.id)
        .where(
            DemoSession.cleaned_at.is_(None),
            (DemoSession.ended_at.is_not(None)) | (DemoSession.expires_at <= now),
        )
        .limit(10)
    ).all()
    db.rollback()
    cleaned = 0
    for identifier in identifiers:
        session = db.exec(
            select(DemoSession)
            .where(
                DemoSession.id == identifier,
                DemoSession.cleaned_at.is_(None),
                (DemoSession.ended_at.is_not(None))
                | (DemoSession.expires_at <= datetime.utcnow()),
            )
            .with_for_update(skip_locked=True)
        ).first()
        if not session:
            db.rollback()
            continue
        # Revoke first. Dropping a schema waits for in-flight DB transactions to finish.
        session.ended_at = session.ended_at or now
        session.state = "ended"
        db.add(session)
        db.commit()
        try:
            drop_namespace(engine, session.namespace, session_lock=True)
            clean_files(session.id)
            clean_cache(session.id)
        except Exception:
            logger.exception("Demo cleanup will retry session=%s", session.id)
            continue
        session.cleaned_at = datetime.utcnow()
        db.add(session)
        db.commit()
        cleaned += 1
    return cleaned


def visitor_fingerprint(ip: str, secret: str) -> str:
    # No raw IP retained. This key limits admission bursts from a shared network.
    return hashlib.sha256(f"{secret}:demo:{ip}".encode()).hexdigest()


def clean_cache(identifier: str) -> None:
    from src.services.security.rate_limiting import get_redis_connection

    client = get_redis_connection()
    for pattern in (f"demo:{identifier}:*", f"collab:ydoc:board_demo_{identifier}_*"):
        batch = []
        for key in client.scan_iter(match=pattern, count=100):
            batch.append(key)
            if len(batch) >= 100:
                client.delete(*batch)
                batch.clear()
        if batch:
            client.delete(*batch)
