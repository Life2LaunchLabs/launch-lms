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
from src.db.organizations import Organization
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

logger = logging.getLogger(__name__)


def publish(db: Session, actor_id: int, revision: int) -> DemoCheckpoint:
    config = configuration(db, lock=True)
    if config.revision != revision:
        raise HTTPException(
            409, "Demo settings or checkpoint changed. Reload before publishing."
        )
    user = db.get(User, config.source_user_id)
    org = db.get(Organization, config.entry_org_id)
    if not user or not org:
        raise HTTPException(
            422, "Configure the live demo user and entry organization first."
        )
    # Publication captures one database transaction; callers use REPEATABLE READ.
    checkpoint = DemoCheckpoint(
        id=uuid4().hex,
        schema_signature=schema_signature(),
        created_by=actor_id,
        source_user_id=user.id,
        source_email=user.email,
        entry_org_slug=org.slug,
        data=capture(db, user.id, org.id),
    )
    checkpoint.data = {
        "schema": schema_signature(),
        "rows": checkpoint.data,
        "files": capture_files(checkpoint.data, user.id),
    }
    db.add(checkpoint)
    config.checkpoint_id = checkpoint.id
    config.revision += 1
    db.add(config)
    db.commit()
    db.refresh(checkpoint, attribute_names=["id", "created_at"])
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


def admit(db: Session, visitor_id: str) -> DemoSession:
    config = configuration(db, lock=True)
    if not config.enabled or not config.checkpoint_id:
        raise HTTPException(
            503, "The demo is not available yet. Please try again later."
        )
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
    from src.services.demo.metadata import checkpoint_info

    checkpoint = checkpoint_info(db, config.checkpoint_id)
    if not checkpoint:
        raise HTTPException(503, "The demo checkpoint is unavailable.")
    if checkpoint.schema_signature != schema_signature():
        raise HTTPException(
            503,
            "The demo needs a fresh checkpoint after this product update. Please try again later.",
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
                data, identifiers = remap(checkpoint.data["rows"], identifier)
                files = checkpoint.data["files"]
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
                except Exception:
                    db.rollback()
                    db.refresh(session)
                    session.state = "failed"
                    session.ended_at = session.ended_at or datetime.utcnow()
                    session.error = "Workspace preparation failed. Please start again."
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


def start(db: Session, engine, visitor_id: str) -> DemoSession:
    """Blocking composition used by internal probes; HTTP admission stays quick."""
    session = admit(db, visitor_id)
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
