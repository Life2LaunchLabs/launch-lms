"""Restart-safe cleanup; bounded batches permit multiple API workers."""

import asyncio
import logging
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import case, func, text
from sqlmodel import Session, select
from src.db.demo import DemoSession
from src.services.demo.lifecycle import cleanup, prepare, publish
from src.services.demo.configuration import configuration
from src.services.demo.metadata import checkpoint_info
from src.services.demo.namespaces import schema_signature

logger = logging.getLogger(__name__)

# Clean copies kept ready; each is a full database schema plus media.
WARM_WORKSPACES = 3
# Concurrent preparations per API process; visitor requests share its CPU.
PREPARATION_CONCURRENCY = 2

# Fixed advisory-lock key so only one API worker republishes at a time.
RECAPTURE_LOCK = 0x44454D4F


def cleanup_batch(engine):
    with Session(engine) as db:
        return cleanup(db, engine)


async def run_cleanup(engine):
    while True:
        try:
            cleaned = await asyncio.to_thread(cleanup_batch, engine)
        except Exception:
            logger.exception("Demo cleanup batch failed; will retry")
            cleaned = 0
        await asyncio.sleep(1 if cleaned else 30)


def pending(engine):
    with Session(engine) as db:
        return db.exec(
            select(DemoSession.id)
            .where(
                DemoSession.state.in_(["preparing", "provisioning"]),
                DemoSession.ended_at.is_(None),
            )
            .order_by(
                case((DemoSession.visitor_id != "", 0), else_=1), DemoSession.created_at
            )
            .limit(PREPARATION_CONCURRENCY)
        ).all()


def replenish(engine):
    """Keep clean copies ready; dirty visitor workspaces are always destroyed."""
    now = datetime.utcnow()
    with Session(engine) as db:
        config = configuration(db, lock=True)
        info = (
            checkpoint_info(db, config.checkpoint_id) if config.checkpoint_id else None
        )
        usable = config.enabled and info and info.schema_signature == schema_signature()
        occupied = db.exec(
            select(func.count())
            .select_from(DemoSession)
            .where(
                DemoSession.visitor_id != "",
                DemoSession.ended_at.is_(None),
                DemoSession.expires_at > now,
                DemoSession.state.in_(["preparing", "provisioning", "active"]),
            )
        ).one()
        # Visitors beyond the warm few are prepared on demand, first in line. Building
        # a copy per free seat starves the API process that also serves visitors.
        target = (
            max(0, min(WARM_WORKSPACES, config.capacity - occupied)) if usable else 0
        )
        unused = db.exec(
            select(DemoSession)
            .where(
                DemoSession.visitor_id == "",
                DemoSession.ended_at.is_(None),
                DemoSession.state.in_(["available", "preparing", "provisioning"]),
            )
            .order_by(DemoSession.created_at)
        ).all()
        retained = 0
        for session in unused:
            if (
                usable
                and session.checkpoint_id == info.id
                and session.schema_signature == schema_signature()
                and session.expires_at > now
                and retained < target
            ):
                retained += 1
            else:
                session.state, session.ended_at = "ended", now
                db.add(session)
        for _ in range(target - retained):
            identifier = uuid4().hex
            db.add(
                DemoSession(
                    id=identifier,
                    namespace="demo_" + identifier,
                    visitor_id="",
                    schema_signature=schema_signature(),
                    checkpoint_id=info.id,
                    duration_minutes=config.session_minutes,
                    expires_at=now + timedelta(hours=1),
                )
            )
        db.commit()


async def run_preparation(engine):
    while True:
        try:
            await asyncio.to_thread(replenish, engine)
            identifiers = await asyncio.to_thread(pending, engine)
            await asyncio.gather(
                *(
                    asyncio.to_thread(prepare, engine, identifier)
                    for identifier in identifiers
                )
            )
        except Exception:
            logger.exception("Demo preparation will retry")
        await asyncio.sleep(1)


def recapture_stale(engine) -> bool:
    """Republish the live scenario when a product update outdated the checkpoint.

    The previous checkpoint stays current until the new one commits. A failure is
    recorded for the operator and not retried until the schema changes again.
    """
    current = schema_signature()
    with Session(engine) as db:
        config = configuration(db)
        info = (
            checkpoint_info(db, config.checkpoint_id) if config.checkpoint_id else None
        )
        if (
            not (config.enabled and config.auto_recapture and info)
            or info.schema_signature == current
            or config.recapture_error_signature == current
        ):
            return False
        revision, actor_id = config.revision, info.created_by
    # Publication needs one stable snapshot; SQLite (tests) has no such level.
    options = (
        {"isolation_level": "REPEATABLE READ"}
        if engine.dialect.name == "postgresql"
        else {}
    )
    try:
        with Session(engine.execution_options(**options)) as db:
            publish(db, actor_id, revision)
    except Exception as error:
        transient = (
            isinstance(error, HTTPException)
            and error.status_code == 409
            or getattr(getattr(error, "orig", None), "pgcode", None) == "40001"
        )
        if transient:
            return False  # Settings or live data moved underneath; try again next tick.
        detail = error.detail if isinstance(error, HTTPException) else None
        if detail is None:
            logger.exception("Automatic demo checkpoint failed")
        else:
            logger.error("Automatic demo checkpoint failed: %s", detail)
        with Session(engine) as db:
            config = configuration(db, lock=True)
            config.recapture_error = (
                detail
                if isinstance(detail, str)
                else "Automatic checkpoint failed. See the server logs."
            )
            config.recapture_error_signature = current
            db.add(config)
            db.commit()
        return False
    logger.info("Automatic demo checkpoint published for schema %s", current[:12])
    return True


def recapture(engine) -> bool:
    with engine.connect() as lease:
        acquired = lease.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": RECAPTURE_LOCK}
        ).scalar()
        lease.commit()
        if not acquired:
            return False
        try:
            return recapture_stale(engine)
        finally:
            lease.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": RECAPTURE_LOCK}
            )
            lease.commit()


async def run_recapture(engine):
    while True:
        try:
            await asyncio.to_thread(recapture, engine)
        except Exception:
            logger.exception("Demo recapture check will retry")
        await asyncio.sleep(30)
