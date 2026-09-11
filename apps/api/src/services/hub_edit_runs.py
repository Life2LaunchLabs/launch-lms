"""Learner-granted Hub editing runs and their durable activity."""

from datetime import datetime, timedelta
import json
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.hub import HubConversation, HubEditObjectState, HubEditRun, HubEditRunEvent
from src.db.planning import Plan
from src.security.org_auth import require_org_membership


ACTIVE = "active"
TERMINAL = {"cancelled", "completed"}
EDIT_RECOVERY_DAYS = 30


def _run_dict(db: Session, run: HubEditRun) -> dict:
    events = db.exec(
        select(HubEditRunEvent)
        .where(HubEditRunEvent.run_id == run.id)
        .order_by(HubEditRunEvent.sequence)
    ).all()
    objects = db.exec(
        select(HubEditObjectState)
        .where(HubEditObjectState.run_id == run.id)
        .order_by(HubEditObjectState.updated_at)
    ).all()
    return {
        "run_uuid": run.run_uuid,
        "conversation_uuid": db.get(HubConversation, run.conversation_id).conversation_uuid,
        "goal": run.goal,
        "scope": {
            "kind": run.scope_kind,
            "target_uuid": run.target_uuid,
            "label": run.target_label,
            "route": run.route,
        },
        "status": run.status,
        "created_at": run.created_at,
        "updated_at": run.updated_at,
        "ended_at": run.ended_at,
        "events": [{
            "event_uuid": event.event_uuid,
            "sequence": event.sequence,
            "kind": event.kind,
            "summary": event.summary,
            "object_type": event.object_type,
            "object_uuid": event.object_uuid,
            "object_label": event.object_label,
            "transient": event.transient,
            "payload": event.payload,
            "created_at": event.created_at,
        } for event in events],
        "objects": [{
            "object_key": item.object_key,
            "object_type": item.object_type,
            "object_uuid": item.object_uuid,
            "status": item.status,
            "current_fields": item.current_fields,
            "proposal_fields": item.proposal_fields,
            "revision": item.revision,
            "updated_at": item.updated_at,
        } for item in objects],
    }


def _owned_conversation(db: Session, conversation_uuid: str, org_id: int, user_id: int) -> HubConversation:
    require_org_membership(user_id, org_id, db)
    conversation = db.exec(select(HubConversation).where(
        HubConversation.conversation_uuid == conversation_uuid,
        HubConversation.org_id == org_id,
        HubConversation.user_id == user_id,
    )).first()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


def active_edit_run(db: Session, conversation_uuid: str, org_id: int, user_id: int) -> dict | None:
    conversation = _owned_conversation(db, conversation_uuid, org_id, user_id)
    run = db.exec(select(HubEditRun).where(
        HubEditRun.conversation_id == conversation.id,
        HubEditRun.status == ACTIVE,
    ).order_by(HubEditRun.updated_at.desc())).first()
    if not run:
        return None
    stale = db.exec(select(HubEditObjectState).where(
        HubEditObjectState.run_id == run.id,
        HubEditObjectState.status == "editing",
        HubEditObjectState.updated_at < datetime.utcnow() - timedelta(days=EDIT_RECOVERY_DAYS),
    )).all()
    for item in stale:
        item.status = "expired"
        item.revision += 1
        db.add(item)
    if stale:
        db.commit()
    return _run_dict(db, run)


def latest_edit_run(db: Session, conversation_uuid: str, org_id: int, user_id: int) -> dict | None:
    """Return the latest run so the transcript can retain its terminal boundary."""
    conversation = _owned_conversation(db, conversation_uuid, org_id, user_id)
    run = db.exec(select(HubEditRun).where(
        HubEditRun.conversation_id == conversation.id,
    ).order_by(HubEditRun.updated_at.desc())).first()
    return _run_dict(db, run) if run else None


def begin_edit_run(
    db: Session, *, conversation_uuid: str, org_id: int, user_id: int,
    action_id: str, route: str, scope_kind: str, target_label: str, goal: str,
    target_uuid: str | None = None,
) -> dict:
    conversation = _owned_conversation(db, conversation_uuid, org_id, user_id)
    existing = db.exec(select(HubEditRun).where(
        HubEditRun.started_from_action_id == action_id,
    )).first()
    if existing:
        if existing.conversation_id != conversation.id or existing.user_id != user_id:
            raise HTTPException(status_code=404, detail="Editing action not found")
        return _run_dict(db, existing)

    now = datetime.utcnow()
    active_runs = db.exec(select(HubEditRun).where(
        HubEditRun.conversation_id == conversation.id,
        HubEditRun.status == ACTIVE,
    )).all()
    if active_runs:
        raise HTTPException(status_code=409, detail="End the current focused session before starting another")

    run = HubEditRun(
        run_uuid=f"hub_edit_run_{uuid4().hex}", conversation_id=int(conversation.id),
        org_id=org_id, user_id=user_id, goal=goal[:500], scope_kind=scope_kind,
        target_uuid=target_uuid, target_label=target_label[:240], route=route,
        started_from_action_id=action_id, created_at=now, updated_at=now,
    )
    db.add(run)
    db.flush()
    db.add(HubEditRunEvent(
        event_uuid=f"hub_edit_event_{uuid4().hex}", run_id=int(run.id), sequence=1,
        kind="run.started", summary=f"Started working on {target_label}",
        object_type="plan" if target_uuid else None, object_uuid=target_uuid,
        object_label=target_label if target_uuid else None,
        payload={"goal": run.goal, "scope_kind": scope_kind, "scope_label": target_label},
        created_at=now,
    ))
    db.commit()
    return _run_dict(db, run)


def conclude_edit_run(db: Session, run_uuid: str, org_id: int, user_id: int, status: str) -> dict:
    if status not in TERMINAL:
        raise HTTPException(status_code=422, detail="Run must be cancelled or completed")
    require_org_membership(user_id, org_id, db)
    run = db.exec(select(HubEditRun).where(
        HubEditRun.run_uuid == run_uuid,
        HubEditRun.org_id == org_id,
        HubEditRun.user_id == user_id,
    )).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Editing run not found")
    if run.status in TERMINAL:
        return _run_dict(db, run)
    if status == "completed" and db.exec(select(HubEditObjectState.id).where(
        HubEditObjectState.run_id == run.id,
        HubEditObjectState.status == "editing",
    )).first() is not None:
        raise HTTPException(status_code=409, detail="Save or cancel the remaining object edits before finishing")
    now = datetime.utcnow()
    run.status = status
    run.updated_at = now
    run.ended_at = now
    db.add(run)
    last_sequence = db.exec(select(HubEditRunEvent.sequence).where(
        HubEditRunEvent.run_id == run.id,
    ).order_by(HubEditRunEvent.sequence.desc())).first() or 0
    db.add(HubEditRunEvent(
        event_uuid=f"hub_edit_event_{uuid4().hex}", run_id=int(run.id),
        sequence=int(last_sequence) + 1, kind=f"run.{status}",
        summary="Stopped editing" if status == "cancelled" else "Finished editing",
        payload={"goal": run.goal, "scope_kind": run.scope_kind, "scope_label": run.target_label},
        created_at=now,
    ))
    db.commit()
    return _run_dict(db, run)


def reopen_edit_run(db: Session, run_uuid: str, org_id: int, user_id: int) -> dict:
    """Reopen the same learner-granted scope while preserving its activity history."""
    require_org_membership(user_id, org_id, db)
    run = db.exec(select(HubEditRun).where(
        HubEditRun.run_uuid == run_uuid,
        HubEditRun.org_id == org_id,
        HubEditRun.user_id == user_id,
    )).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Editing run not found")
    if run.status == ACTIVE:
        return _run_dict(db, run)
    other = db.exec(select(HubEditRun.id).where(
        HubEditRun.conversation_id == run.conversation_id,
        HubEditRun.status == ACTIVE,
        HubEditRun.id != run.id,
    )).first()
    if other is not None:
        raise HTTPException(status_code=409, detail="End the current focused session before restoring this one")
    now = datetime.utcnow()
    run.status = ACTIVE
    run.ended_at = None
    run.updated_at = now
    db.add(run)
    last_sequence = db.exec(select(HubEditRunEvent.sequence).where(
        HubEditRunEvent.run_id == run.id,
    ).order_by(HubEditRunEvent.sequence.desc())).first() or 0
    db.add(HubEditRunEvent(
        event_uuid=f"hub_edit_event_{uuid4().hex}", run_id=int(run.id),
        sequence=int(last_sequence) + 1, kind="run.reopened",
        summary="Reopened focused session",
        payload={"goal": run.goal, "scope_kind": run.scope_kind, "scope_label": run.target_label},
        created_at=now,
    ))
    db.commit()
    return _run_dict(db, run)


def update_edit_run_goal(db: Session, run_uuid: str, org_id: int, user_id: int, goal: str) -> dict:
    """Update the learner-visible goal without changing the run's granted scope."""
    require_org_membership(user_id, org_id, db)
    run = db.exec(select(HubEditRun).where(
        HubEditRun.run_uuid == run_uuid,
        HubEditRun.org_id == org_id,
        HubEditRun.user_id == user_id,
    )).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Editing run not found")
    if run.status != ACTIVE:
        raise HTTPException(status_code=409, detail="The editing run is no longer active")
    normalized = goal.strip()
    if not normalized:
        raise HTTPException(status_code=422, detail="The editing goal is required")
    if normalized == run.goal:
        return _run_dict(db, run)
    now = datetime.utcnow()
    run.goal = normalized[:500]
    run.updated_at = now
    db.add(run)
    last_sequence = db.exec(select(HubEditRunEvent.sequence).where(
        HubEditRunEvent.run_id == run.id,
    ).order_by(HubEditRunEvent.sequence.desc())).first() or 0
    db.add(HubEditRunEvent(
        event_uuid=f"hub_edit_event_{uuid4().hex}", run_id=int(run.id),
        sequence=int(last_sequence) + 1, kind="run.goal_updated",
        summary="Updated the session goal", payload={"goal": run.goal}, created_at=now,
    ))
    db.commit()
    return _run_dict(db, run)


def record_edit_run_activity(
    db: Session, run_uuid: str, *, kind: str, summary: str, payload: dict | None = None,
    transient: bool = True,
) -> None:
    """Append transparent agent activity to the ordered session transcript."""
    run = db.exec(select(HubEditRun).where(HubEditRun.run_uuid == run_uuid)).first()
    if run is None or run.status != ACTIVE:
        return
    last_sequence = db.exec(select(HubEditRunEvent.sequence).where(
        HubEditRunEvent.run_id == run.id,
    ).order_by(HubEditRunEvent.sequence.desc())).first() or 0
    db.add(HubEditRunEvent(
        event_uuid=f"hub_edit_event_{uuid4().hex}", run_id=int(run.id),
        sequence=int(last_sequence) + 1, kind=kind[:40], summary=summary,
        transient=transient, payload=payload or {}, created_at=datetime.utcnow(),
    ))
    db.commit()


def save_object_state(
    db: Session, *, run_uuid: str, org_id: int, user_id: int, object_key: str,
    object_type: str, current_fields: dict, proposal_fields: dict, object_uuid: str | None = None,
    status: str = "editing", expected_revision: int | None = None,
) -> dict:
    """Recover native editor state without exposing a separate draft resource."""
    if status not in {"editing", "cancelled", "saved"}:
        raise HTTPException(status_code=422, detail="Invalid object edit status")
    if len(current_fields) > 50 or len(proposal_fields) > 50 or len(json.dumps([current_fields, proposal_fields])) > 20_000:
        raise HTTPException(status_code=422, detail="Object edit state is too large")
    require_org_membership(user_id, org_id, db)
    run = db.exec(select(HubEditRun).where(
        HubEditRun.run_uuid == run_uuid,
        HubEditRun.org_id == org_id,
        HubEditRun.user_id == user_id,
    )).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Editing run not found")
    if run.status != ACTIVE:
        raise HTTPException(status_code=409, detail="The editing run is no longer active")
    if object_key == "new-plan" and run.scope_kind != "new_plan" and status != "saved":
        raise HTTPException(status_code=409, detail="The new plan editor is no longer active")
    item = db.exec(select(HubEditObjectState).where(
        HubEditObjectState.run_id == run.id,
        HubEditObjectState.object_key == object_key,
    )).first()
    current_revision = item.revision if item else 0
    if expected_revision is not None and expected_revision != current_revision:
        raise HTTPException(status_code=409, detail="This object was edited in another session")
    now = datetime.utcnow()
    previous_status = item.status if item else None
    if item is None:
        item = HubEditObjectState(
            run_id=int(run.id), object_key=object_key[:160], object_type=object_type[:40],
            object_uuid=object_uuid,
            current_fields=current_fields, proposal_fields=proposal_fields, status=status,
            created_at=now, updated_at=now,
        )
    else:
        item.object_type = object_type[:40]
        if object_uuid:
            item.object_uuid = object_uuid
        item.current_fields = current_fields
        item.proposal_fields = proposal_fields
        item.status = status
        item.revision += 1
        item.updated_at = now
    run.updated_at = now
    db.add(item)
    db.add(run)
    if status in {"saved", "cancelled"} and previous_status != status:
        last_sequence = db.exec(select(HubEditRunEvent.sequence).where(
            HubEditRunEvent.run_id == run.id,
        ).order_by(HubEditRunEvent.sequence.desc())).first() or 0
        label = str(current_fields.get("title") or current_fields.get("name") or object_type.title())[:240]
        db.add(HubEditRunEvent(
            event_uuid=f"hub_edit_event_{uuid4().hex}", run_id=int(run.id),
            sequence=int(last_sequence) + 1, kind=f"{object_type}.{status}",
            summary=f"{'Saved' if status == 'saved' else 'Cancelled'} {label}",
            object_type=object_type[:40], object_uuid=object_uuid,
            object_label=label, payload={"object_key": object_key}, created_at=now,
        ))
    db.commit()
    db.refresh(item)
    return {
        "object_key": item.object_key, "object_type": item.object_type,
        "object_uuid": item.object_uuid, "status": item.status,
        "current_fields": item.current_fields, "proposal_fields": item.proposal_fields,
        "revision": item.revision, "updated_at": item.updated_at,
    }


def bind_created_plan(
    db: Session, run_uuid: str, org_id: int, user_id: int, plan_identifier: str,
) -> dict:
    require_org_membership(user_id, org_id, db)
    run = db.exec(select(HubEditRun).where(
        HubEditRun.run_uuid == run_uuid,
        HubEditRun.org_id == org_id,
        HubEditRun.user_id == user_id,
    )).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Editing run not found")
    if run.status != ACTIVE or run.scope_kind != "new_plan":
        raise HTTPException(status_code=409, detail="This run is not waiting for a new plan")
    plan = db.exec(select(Plan).where(
        (Plan.plan_uuid == plan_identifier) | (Plan.slug == plan_identifier),
        Plan.owner_user_id == user_id,
        Plan.source_assignment_id.is_(None),
    )).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="New personal plan not found")

    now = datetime.utcnow()
    run.scope_kind = "plan"
    run.target_uuid = plan.plan_uuid
    run.target_label = plan.name[:240]
    run.route = f"/plans/{plan.slug}"
    run.updated_at = now
    db.add(run)
    recovered = db.exec(select(HubEditObjectState).where(
        HubEditObjectState.run_id == run.id,
        HubEditObjectState.object_key == "new-plan",
    )).first()
    if recovered:
        recovered.status = "saved"
        recovered.object_uuid = plan.plan_uuid
        recovered.revision += 1
        recovered.updated_at = now
        db.add(recovered)
    last_sequence = db.exec(select(HubEditRunEvent.sequence).where(
        HubEditRunEvent.run_id == run.id,
    ).order_by(HubEditRunEvent.sequence.desc())).first() or 0
    db.add(HubEditRunEvent(
        event_uuid=f"hub_edit_event_{uuid4().hex}", run_id=int(run.id),
        sequence=int(last_sequence) + 1, kind="plan.created",
        summary=f"Created plan {plan.name}", object_type="plan",
        object_uuid=plan.plan_uuid, object_label=plan.name, created_at=now,
    ))
    db.commit()
    return _run_dict(db, run)
