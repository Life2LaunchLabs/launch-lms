"""Progress cards: what happens on a plan, posted into its chat as it happens.

Finishing, turning in and reviewing steps arrive as cards, and one person's progress on one plan
gathers into a single card while it keeps coming ("Finished 1 step and turned in 1 step").
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from src.db.conversations import Conversation, ConversationMessageRef
from src.db.goals import Goal, GoalStatus, StepStatus
from src.services.connect import chats
from src.services.connect.workspace import PROGRESS, _external, _step, _value, attach, chat_for_goal, sync_goal
from src.services.goals.sharing_roles import _stamp

# Progress from one person on one plan gathers into one card while it keeps coming.
GATHER_WINDOW = timedelta(hours=6)


def _progress_body(card: dict) -> str:
    if card.get("started") and not card.get("events"):
        return f"Started {card['goal_title']}"
    verbs = {"finished": "Finished", "turned_in": "Turned in", "approved": "Approved", "changes": "Asked for changes on", "marked_done": "Marked done", "excused": "Excused"}
    events = card.get("events") or []
    if len(events) == 1:
        return f"{verbs[events[0]['event']]} {events[0]['title']}"
    counts: dict[str, int] = {}
    for event in events:
        counts[event["event"]] = counts.get(event["event"], 0) + 1
    parts = [f"{verbs[name].lower()} {count} step{'s' if count != 1 else ''}" for name, count in counts.items()]
    text = ", ".join(parts[:-1]) + (" and " if len(parts) > 1 else "") + parts[-1]
    return text[0].upper() + text[1:]


def _event(goal: Goal, actor_id: int | None, previous: str, current: str) -> str | None:
    learner = actor_id in (None, goal.subject_user_id)
    if current == StepStatus.COMPLETED.value:
        return "finished" if learner else "approved" if previous == StepStatus.SUBMITTED.value else "marked_done"
    if current == StepStatus.SUBMITTED.value:
        return "turned_in"
    if current == StepStatus.CHANGES_REQUESTED.value:
        return "changes"
    if current == StepStatus.EXCUSED.value:
        return "excused"
    return None


def _post_progress(db: Session, conversation: Conversation, goal: Goal, sender_id: int | None, entry: dict | None) -> None:
    last = chats._last(db, conversation)
    card = last.card if last and last.kind == "card" else None
    recent = bool(last and last.creation_date > (datetime.now(timezone.utc) - GATHER_WINDOW).isoformat())
    if entry and card and card.get("type") == PROGRESS and not card.get("started") and card.get("goal_uuid") == goal.goal_uuid and last.sender_user_id == sender_id and recent:  # type: ignore[union-attr]
        events = [item for item in card.get("events") or [] if item["step_uuid"] != entry["step_uuid"]] + [entry]
        merged = {**card, "events": events, "goal_title": goal.title}
        now = _stamp()
        last.card, last.body, last.update_date = merged, _progress_body(merged), now  # type: ignore[union-attr]
        refs = list(last.refs or [])  # type: ignore[union-attr]
        step_ref = {"kind": "step", "goal_uuid": goal.goal_uuid, "step_uuid": entry["step_uuid"]}
        if step_ref not in refs:
            last.refs = [*refs, step_ref]  # type: ignore[union-attr]
            attach(db, last, [(int(goal.id), entry["step_uuid"])])  # type: ignore[arg-type]
        conversation.last_message_at, conversation.update_date = now, now
        db.add(last)
        db.add(conversation)
        db.flush()
        return
    fresh = {"type": PROGRESS, "goal_uuid": goal.goal_uuid, "goal_title": goal.title, "started": entry is None, "events": [entry] if entry else []}
    refs = [{"kind": "plan", "goal_uuid": goal.goal_uuid}, *([{"kind": "step", "goal_uuid": goal.goal_uuid, "step_uuid": entry["step_uuid"]}] if entry else [])]
    message = chats.post(db, conversation, sender_id, _progress_body(fresh), kind="card", card=fresh, refs=refs)
    attach(db, message, [(int(goal.id), entry["step_uuid"] if entry else None)])  # type: ignore[arg-type]


def on_goal_event(db: Session, goal: Goal, actor_id: int | None, action: str, payload: dict) -> None:
    """Keep a plan's chat in step with what happens on the plan."""
    if action in ("goal.issued", "goal.accepted", "invitation.accepted") and _external(goal) and _value(goal.status) == GoalStatus.ACTIVE.value:
        conversation = chat_for_goal(db, goal)
        if conversation and not db.exec(select(ConversationMessageRef.id).where(ConversationMessageRef.conversation_id == conversation.id, ConversationMessageRef.goal_id == goal.id)).first():
            _post_progress(db, conversation, goal, goal.subject_user_id, None)
    elif action in ("invitation.accepted", "collaborator.removed", "collaborator.left", "collaborator.role_changed", "collaborator.request_resolved", "ownership.transferred", "goal.updated"):
        sync_goal(db, goal)
    elif action == "step.status":
        event = _event(goal, actor_id, str(payload.get("from") or ""), str(payload.get("to") or ""))
        step = _step(db, goal, payload.get("step_uuid"))
        conversation = chat_for_goal(db, goal, create=False) if event and step else None
        if conversation and step:
            entry = {"step_uuid": step.step_uuid, "title": step.title, "event": event, "at": _stamp(),
                     # What the reviewer wrote to the learner, shown under the step on the card.
                     **({"note": str(payload["note"])[:2000]} if payload.get("note") else {})}
            _post_progress(db, conversation, goal, actor_id or goal.subject_user_id, entry)
