"""Checkpoints: a test run's world captured at a stage, and published as the demo.

Tests and demos are one system. A story is acted out by personas; when every persona finishes
a stage (or an admin asks), the run's world is captured with Demo Studio's own capture, which
copies only what its policies list and never the test tables. Publishing a checkpoint makes it
the demo: visitors get a private copy and pick any of the run's personas.
"""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.user_tests import TestCheckpoint, TestCohort, TestPersona
from src.db.users import User
from src.services.user_tests.cohorts import get_cohort

logger = logging.getLogger(__name__)


def _persona_users(db: Session, cohort: TestCohort) -> dict[int, User]:
    rows = db.exec(select(User).join(TestPersona, TestPersona.user_id == User.id).where(TestPersona.cohort_id == cohort.id)).all()
    return {int(user.id): user for user in rows}  # type: ignore[arg-type]


def capture(db: Session, cohort: TestCohort, stage_key: str | None, actor_id: int | None, label: str = "") -> TestCheckpoint:
    """Capture the run's personas, their orgs and the main org, and prove a visitor copy can be built."""
    from src.services.demo.checkpoints import capture as capture_rows
    from src.services.demo.cohort import default_org, identity
    from src.services.demo.lifecycle import summarize
    from src.services.demo.media import capture_files
    from src.services.demo.namespaces import schema_signature
    from src.services.demo.portraits import published_portrait
    from src.services.demo.rehearsal import rehearse

    if stage_key is not None and stage_key not in {stage["key"] for stage in cohort.stages or []}:
        raise HTTPException(404, f"There is no stage \"{stage_key}\" in this run.")
    users = _persona_users(db, cohort)
    if not users:
        raise HTTPException(422, "This run has no personas to capture.")
    main = default_org(db)
    rows = capture_rows(db, int(main.id), set(users))  # type: ignore[arg-type]
    warnings: list[dict] = []
    files = capture_files(rows, set(users), warnings)
    pilots, portraits = {}, {}
    for user in users.values():
        portrait = published_portrait(user, files)
        if portrait:
            portraits[str(user.id)] = portrait
        pilots[str(user.id)] = {**identity(user), "email": user.email, "has_avatar": bool(portrait)}
    summary = summarize({"main": main, "users": users, "rows": rows, "files": files, "warnings": warnings})
    rehearse(db.get_bind(), rows, files)
    titles = {stage["key"]: stage["title"] for stage in cohort.stages or []}
    checkpoint = TestCheckpoint(
        id=uuid4().hex, cohort_id=int(cohort.id), stage_key=stage_key,  # type: ignore[arg-type]
        label=label.strip()[:120] or (f"After {titles[stage_key]}" if stage_key else "Captured by hand"),
        created_by=actor_id, schema_signature=schema_signature(), pilots=pilots, portraits=portraits, summary=summary,
        data={"schema": schema_signature(), "rows": rows, "files": files, "summary": summary},
    )
    db.add(checkpoint)
    db.commit()
    return checkpoint


def capture_now(db: Session, cohort_uuid: str, actor_id: int, stage_key: str | None = None, label: str = "") -> dict:
    return serialize(capture(db, get_cohort(db, cohort_uuid), stage_key, actor_id, label))


def stage_finished(db: Session, cohort: TestCohort, stage_key: str) -> bool:
    personas = db.exec(select(TestPersona).where(TestPersona.cohort_id == cohort.id)).all()
    return bool(personas) and all(((persona.stage_state or {}).get(stage_key) or {}).get("status") == "done" for persona in personas)


def capture_after_stage(cohort_id: int, stage_key: str) -> None:
    """Run after a persona reports a stage done: capture once every persona has finished it.

    On its own connection, after the response, since capturing takes a few seconds.
    """
    from src.core.events.database import engine

    try:
        with Session(engine) as db:
            cohort = db.get(TestCohort, cohort_id)
            if not cohort or not stage_finished(db, cohort, stage_key):
                return
            already = db.exec(select(TestCheckpoint.id).where(TestCheckpoint.cohort_id == cohort_id, TestCheckpoint.stage_key == stage_key)).first()
            if not already:
                capture(db, cohort, stage_key, None)
    except Exception:
        logger.exception("Could not capture a checkpoint for stage %s of test cohort %s", stage_key, cohort_id)


def serialize(checkpoint: TestCheckpoint, *, live_id: str | None = None) -> dict:
    from src.services.demo.namespaces import schema_signature

    return {
        "id": checkpoint.id, "stage_key": checkpoint.stage_key, "label": checkpoint.label,
        "automatic": checkpoint.created_by is None, "created_at": checkpoint.created_at.isoformat() + "Z",
        "records": (checkpoint.summary or {}).get("records", 0), "files": (checkpoint.summary or {}).get("files", 0),
        "warnings": len((checkpoint.summary or {}).get("warnings", [])),
        "current": checkpoint.schema_signature == schema_signature(),
        "published": live_id is not None and live_id == checkpoint.id,
    }


def list_checkpoints(db: Session, cohort_uuid: str) -> list[dict]:
    from src.db.demo import DemoConfiguration

    cohort = get_cohort(db, cohort_uuid)
    config = db.get(DemoConfiguration, 1)  # seeded by Demo Studio's migration
    live = config.checkpoint_id if config else None
    rows = db.exec(select(TestCheckpoint).where(TestCheckpoint.cohort_id == cohort.id).order_by(TestCheckpoint.created_at)).all()  # type: ignore[arg-type]
    return [serialize(row, live_id=live) for row in rows]


def publish(db: Session, checkpoint_id: str, actor_id: int) -> dict:
    """Make a run's checkpoint the demo. Its personas become pickable demo users; nothing is re-captured."""
    from src.db.demo import DemoCheckpoint, DemoMember
    from sqlalchemy import func
    from src.services.demo.cohort import default_org, unique_handle
    from src.services.demo.configuration import configuration
    from src.services.demo.namespaces import schema_signature

    found = db.get(TestCheckpoint, checkpoint_id)
    if not found:
        raise HTTPException(404, "That checkpoint no longer exists.")
    if found.schema_signature != schema_signature():
        raise HTTPException(422, "This checkpoint was captured before a product update. Capture the stage again, then publish.")
    config = configuration(db, lock=True)
    users = {int(key): db.get(User, int(key)) for key in found.pilots}
    if any(user is None for user in users.values()):
        raise HTTPException(422, "Some of this run's personas were purged, so its checkpoint can't become the demo.")
    position = db.exec(select(func.max(DemoMember.position))).one() or 0
    for user_id, user in users.items():
        member = db.get(DemoMember, user_id)
        if member is None:
            position += 1
            db.add(DemoMember(user_id=user_id, pilotable=True, handle=unique_handle(db, user.first_name or user.username), position=position))  # type: ignore[union-attr]
        elif not member.pilotable:
            member.pilotable = True
            db.add(member)
    db.flush()
    # The demo version keeps the checkpoint's id, so the console knows which one is live and
    # publishing it again only points the demo back at it.
    if db.get(DemoCheckpoint, found.id) is None:
        db.add(DemoCheckpoint(
            id=found.id, schema_signature=found.schema_signature, created_by=actor_id,
            entry_org_slug=default_org(db).slug, pilots=found.pilots, portraits=found.portraits, data=found.data,
        ))
    config.checkpoint_id = found.id
    config.recapture_error = config.recapture_error_signature = None
    config.revision += 1
    db.add(config)
    db.commit()
    return {"demo_checkpoint_id": found.id, "personas": len(users), "demo_enabled": config.enabled, "published_at": datetime.utcnow().isoformat() + "Z"}


def demo_members(db: Session, user_ids: set[int]) -> set[int]:
    """Personas Demo Studio lists as demo users; purge waits until they are removed there."""
    from src.db.demo import DemoMember

    if not user_ids:
        return set()
    return set(db.exec(select(DemoMember.user_id).where(DemoMember.user_id.in_(user_ids))).all())  # type: ignore[attr-defined]
