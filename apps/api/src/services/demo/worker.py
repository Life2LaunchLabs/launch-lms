"""Restart-safe cleanup; bounded batches permit multiple API workers."""

import asyncio
import logging
from datetime import datetime, timedelta
from uuid import uuid4

from sqlmodel import Session
from sqlmodel import select
from sqlalchemy import func, case
from src.db.demo import DemoSession
from src.services.demo.lifecycle import cleanup, prepare
from src.services.demo.configuration import configuration
from src.services.demo.metadata import checkpoint_info
from src.services.demo.namespaces import schema_signature

logger = logging.getLogger(__name__)


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
            .limit(4)
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
        target = max(0, config.capacity - occupied) if usable else 0
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
