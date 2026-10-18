"""Chats as the shared workspace on someone's plans.

Every plan with people on it talks in one chat. A plan an organization gave a learner (an
assignment, a badge) talks in the learner's chat with that organization, alongside their other
plans with it; a personal plan talks in a chat of its own once someone else is on it. A message
tags plans, steps, people and organizations inline as tokens (``<step:goal_uuid/step_uuid>``),
so the chat filters by plan and then by step: a comment on a step is just a message that tags
it. The app posts each plan's progress there as cards, and older goal comments move in the
first time their plan's chat is opened.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, func, select

from src.db.conversations import Conversation, ConversationMember, ConversationMessage, ConversationMessageRef
from src.db.goal_comments import GoalComment
from src.db.goals import DONE_STEP_STATUSES, Goal, GoalOwnership, GoalSource, GoalStage, GoalStatus, GoalStep, StepProgress, StepStatus
from src.db.organizations import Organization
from src.db.planning import PlanCollaborator, PlanCollaboratorRequestCreate, PlanInvitationCreate, PlanRole
from src.db.users import PublicUser, User
from src.services.connect import chats, people
from src.services.goals import access
from src.services.goals.sharing_roles import _stamp, org_summary
from src.services.school import chats as school_chats

GOAL = "goal"
KINDS = (school_chats.SCHOOL, GOAL)
PROGRESS = "plan_progress"
ORG_MENTION = "org_mention"
TOKEN = re.compile(r"<(plan|step|user|org):([A-Za-z0-9_.-]+)(?:/([A-Za-z0-9_.-]+))?>")
# Plans a chat is about: waiting to be accepted, under way, or finished.
LIVE = (GoalStatus.PENDING.value, GoalStatus.ACTIVE.value, GoalStatus.FINISHED.value)
# Progress from one person on one plan gathers into one card while it keeps coming.
GATHER_WINDOW = timedelta(hours=6)
INVITE_ROLE = "commenter"
ORG_SOURCES = (GoalSource.ASSIGNMENT.value, GoalSource.BADGE.value)


def _value(item) -> str:
    return getattr(item, "value", item)


def _external(goal: Goal) -> bool:
    """A plan an organization gave the learner: assigned to them, or one they started to earn its badge."""
    return _value(goal.ownership) == GoalOwnership.EXTERNAL.value and _value(goal.source) in ORG_SOURCES and bool(goal.org_id and goal.subject_user_id)


def _goal_key(goal_id: int) -> str:
    return f"goal:{goal_id}"


# Who's in a chat


def org_goals(db: Session, org_id: int, student_id: int) -> list[Goal]:
    """The plans an organization gave this learner, unless they turned them down or they were archived."""
    return list(db.exec(select(Goal).where(
        Goal.org_id == org_id, Goal.subject_user_id == student_id, Goal.ownership == GoalOwnership.EXTERNAL.value,
        col(Goal.source).in_(ORG_SOURCES), col(Goal.status).in_(LIVE),
    ).order_by(col(Goal.id))).all())


def plan_people(db: Session, org_id: int, student_id: int) -> set[int]:
    """Everyone with a role that lets them comment on the learner's plans with this organization."""
    goals = org_goals(db, org_id, student_id)
    if not goals:
        return set()
    rows = db.exec(select(PlanCollaborator.user_id, PlanRole.key, PlanRole.capabilities).join(PlanRole, PlanRole.id == PlanCollaborator.role_id).where(
        col(PlanCollaborator.goal_id).in_([goal.id for goal in goals]), PlanCollaborator.active == True,  # noqa: E712
    )).all()
    commenters = {int(user_id) for user_id, key, granted in rows if key == "plan_admin" or "comment" in access.normalized(granted)}
    return (commenters | {int(goal.owner_user_id) for goal in goals}) - {student_id}


def _goal_people(db: Session, goal: Goal) -> set[int]:
    """Everyone who can see a personal plan."""
    ids = {goal.owner_user_id, goal.subject_user_id, *db.exec(select(PlanCollaborator.user_id).where(
        PlanCollaborator.goal_id == goal.id, PlanCollaborator.active == True,  # noqa: E712
    )).all()}
    return {int(user_id) for user_id in ids if user_id and "view_plan" in access.capabilities(db, goal, int(user_id))}


def _set_members(db: Session, conversation: Conversation, wanted: set[int]) -> None:
    now = _stamp()
    current = {member.user_id: member for member in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)).all()}
    for user_id in wanted - set(current):
        db.add(ConversationMember(conversation_id=int(conversation.id), user_id=user_id, status="active", creation_date=now, update_date=now))  # type: ignore[arg-type]
    for user_id, member in current.items():
        if user_id not in wanted:
            db.delete(member)
    db.flush()


def _goal_chat(db: Session, goal: Goal, create: bool) -> Conversation | None:
    """A personal plan's own chat, once someone besides its learner can see it."""
    conversation = db.exec(select(Conversation).where(Conversation.direct_key == _goal_key(int(goal.id)))).first()  # type: ignore[arg-type]
    wanted = _goal_people(db, goal)
    if not conversation:
        if not create or len(wanted) < 2:
            return None
        now = _stamp()
        conversation = Conversation(conversation_uuid=f"chat_{uuid4()}", kind=GOAL, direct_key=_goal_key(int(goal.id)), title=goal.title,  # type: ignore[arg-type]
                                    org_id=goal.org_id, created_by_user_id=goal.owner_user_id, creation_date=now, update_date=now)
        db.add(conversation)
        db.flush()
    elif conversation.title != goal.title:
        conversation.title = goal.title
        db.add(conversation)
    _set_members(db, conversation, wanted)
    return conversation


def chat_for_goal(db: Session, goal: Goal, create: bool = True) -> Conversation | None:
    """The chat a plan talks in, with its people brought up to date. None while nobody else is on it."""
    if _external(goal):
        if _value(goal.status) not in LIVE:
            return None
        conversation = school_chats.school_chat(db, int(goal.org_id), int(goal.subject_user_id)) if create else school_chats.find(db, int(goal.org_id), int(goal.subject_user_id))  # type: ignore[arg-type]
    else:
        conversation = _goal_chat(db, goal, create)
    if conversation:
        _adopt_comments(db, goal, conversation)
    return conversation


def goals_in(db: Session, conversation: Conversation) -> list[Goal]:
    """The plans a chat is about, in the order they started."""
    key = conversation.direct_key or ""
    if conversation.kind == school_chats.SCHOOL and key.startswith("school:"):
        _, org_id, student_id = key.split(":")
        return org_goals(db, int(org_id), int(student_id))
    if conversation.kind == GOAL and key.startswith("goal:"):
        goal = db.get(Goal, int(key.split(":")[1]))
        return [goal] if goal else []
    return []


def sync_goal(db: Session, goal: Goal) -> None:
    """Bring a plan's chat up to date after its people change."""
    if _external(goal):
        if school_chats.find(db, int(goal.org_id), int(goal.subject_user_id)) or _value(goal.status) in LIVE:  # type: ignore[arg-type]
            school_chats.school_chat(db, int(goal.org_id), int(goal.subject_user_id))  # type: ignore[arg-type]
    else:
        _goal_chat(db, goal, create=False)


def can_post(db: Session, conversation: Conversation, user_id: int) -> bool:
    """Whether a member may write here: everyone in an organization chat, and commenters on a personal plan."""
    if conversation.kind != GOAL:
        return True
    return any("comment" in access.capabilities(db, goal, user_id) for goal in goals_in(db, conversation))


# Tags in a message


def _step(db: Session, goal: Goal, step_uuid: str | None) -> GoalStep | None:
    return db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.step_uuid == step_uuid)).first() if step_uuid else None


def prepare(db: Session, conversation: Conversation, body: str) -> tuple[str, list[dict], list[tuple[int, str | None]]]:
    """A message's text with only the tags that resolve here kept, what it tags, and the plan rows to filter it by."""
    goals = {goal.goal_uuid: goal for goal in goals_in(db, conversation)}
    refs: list[dict] = []
    rows: list[tuple[int, str | None]] = []

    def keep(match: re.Match) -> str:
        kind, first, second = match.groups()
        ref: dict | None = None
        if kind in ("plan", "step"):
            goal = goals.get(first)
            step = _step(db, goal, second) if goal and kind == "step" else None
            if goal and (kind == "plan" or step):
                ref = {"kind": kind, "goal_uuid": first, **({"step_uuid": second} if step else {})}
                row = (int(goal.id), second if step else None)  # type: ignore[arg-type]
                if row not in rows:
                    rows.append(row)
        elif kind == "user" and db.exec(select(User.id).where(User.user_uuid == first)).first():
            ref = {"kind": "user", "user_uuid": first}
        elif kind == "org" and db.exec(select(Organization.id).where(Organization.org_uuid == first)).first():
            ref = {"kind": "org", "org_uuid": first}
        if not ref:
            return ""
        if ref not in refs:
            refs.append(ref)
        return match.group(0)

    text = re.sub(r"[ \t]{2,}", " ", TOKEN.sub(keep, body)).strip()
    return text, refs, rows


def attach(db: Session, message: ConversationMessage, rows: list[tuple[int, str | None]]) -> None:
    for goal_id, step_uuid in rows:
        db.add(ConversationMessageRef(message_id=int(message.id), conversation_id=message.conversation_id, goal_id=goal_id, step_uuid=step_uuid))  # type: ignore[arg-type]
    db.flush()


def _step_status(db: Session, step: GoalStep) -> str:
    progress = db.exec(select(StepProgress.status).where(StepProgress.step_id == step.id)).first()
    return _value(progress) if progress else StepStatus.NOT_STARTED.value


def resolve(db: Session, refs: list[dict] | None, cache: dict) -> list[dict]:
    """Tags as the reader sees them now: current titles, names and states. Gone things drop out."""
    resolved: list[dict] = []
    for ref in refs or []:
        kind = ref.get("kind")
        key = f"{kind}:{ref.get('goal_uuid') or ref.get('user_uuid') or ref.get('org_uuid')}" + (f"/{ref['step_uuid']}" if ref.get("step_uuid") else "")
        if key not in cache:
            cache[key] = _resolve_one(db, ref)
        if cache[key]:
            resolved.append({**cache[key], "key": key})
    return resolved


def _resolve_one(db: Session, ref: dict) -> dict | None:
    kind = ref.get("kind")
    if kind in ("plan", "step"):
        goal = db.exec(select(Goal).where(Goal.goal_uuid == ref.get("goal_uuid"))).first()
        if not goal:
            return None
        if kind == "plan":
            return {"kind": "plan", "goal_uuid": goal.goal_uuid, "title": goal.title}
        step = _step(db, goal, ref.get("step_uuid"))
        return {"kind": "step", "goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid, "title": step.title, "plan_title": goal.title,
                "status": _step_status(db, step)} if step else None
    if kind == "user":
        user = db.exec(select(User).where(User.user_uuid == ref.get("user_uuid"))).first()
        summary = people.person(db, user.id) if user else None
        return {"kind": "user", **summary} if summary else None
    if kind == "org":
        org = db.exec(select(Organization).where(Organization.org_uuid == ref.get("org_uuid"))).first()
        summary = org_summary(db, org.id) if org else None
        return {"kind": "org", **summary} if summary else None
    return None


def plain(db: Session, body: str, refs: list[dict] | None) -> str:
    """A message with its tags written out as their names, for previews."""
    names = {item["key"]: item for item in resolve(db, refs, {})}

    def name(match: re.Match) -> str:
        kind, first, second = match.groups()
        item = names.get(f"{kind}:{first}" + (f"/{second}" if second else ""))
        if not item:
            return ""
        return f"@{item['name']}" if kind in ("user", "org") else item["title"]

    return TOKEN.sub(name, body)


def mentioned(db: Session, refs: list[dict] | None) -> set[int]:
    uuids = [ref["user_uuid"] for ref in refs or [] if ref.get("kind") == "user"]
    return {int(user_id) for user_id in db.exec(select(User.id).where(col(User.user_uuid).in_(uuids))).all()} if uuids else set()


# Filters


def filtered(query, db: Session, conversation: Conversation, goal_uuid: str | None, step_uuid: str | None):
    """Narrow a chat's messages to the ones about a plan, or one of its steps."""
    goal = next((item for item in goals_in(db, conversation) if item.goal_uuid == goal_uuid), None)
    if not goal:
        raise HTTPException(status_code=404, detail="That plan isn't in this chat")
    about = select(ConversationMessageRef.message_id).where(ConversationMessageRef.conversation_id == conversation.id, ConversationMessageRef.goal_id == goal.id)
    if step_uuid:
        about = about.where(ConversationMessageRef.step_uuid == step_uuid)
    return query.where(col(ConversationMessage.id).in_(about))


def _ordered_steps(db: Session, goal: Goal) -> list[GoalStep]:
    stages = {int(stage.id): stage.position for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all()}  # type: ignore[arg-type]
    steps = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()
    return sorted(steps, key=lambda step: (stages.get(int(step.stage_id or 0), -1), step.position, int(step.id)))  # type: ignore[arg-type]


def topics(db: Session, conversation: Conversation) -> list[dict]:
    """The plans this chat is about, each with its steps, where they stand, and how many messages tag them."""
    goals = goals_in(db, conversation)
    if not goals:
        return []
    by_step = {(int(goal_id), step_uuid): int(count) for goal_id, step_uuid, count in db.exec(
        select(ConversationMessageRef.goal_id, ConversationMessageRef.step_uuid, func.count(func.distinct(ConversationMessageRef.message_id)))
        .where(ConversationMessageRef.conversation_id == conversation.id).group_by(ConversationMessageRef.goal_id, ConversationMessageRef.step_uuid)
    ).all()}
    by_goal = {int(goal_id): int(count) for goal_id, count in db.exec(
        select(ConversationMessageRef.goal_id, func.count(func.distinct(ConversationMessageRef.message_id)))
        .where(ConversationMessageRef.conversation_id == conversation.id).group_by(ConversationMessageRef.goal_id)
    ).all()}
    today = date.today()
    plans = []
    for goal in goals:
        steps = _ordered_steps(db, goal)
        statuses = {int(step_id): _value(status) for step_id, status in db.exec(
            select(StepProgress.step_id, StepProgress.status).where(col(StepProgress.step_id).in_([step.id for step in steps]))
        ).all()} if steps else {}
        rows = []
        for step in steps:
            status = statuses.get(int(step.id), StepStatus.NOT_STARTED.value)  # type: ignore[arg-type]
            rows.append({"step_uuid": step.step_uuid, "title": step.title, "status": status, "due_date": step.due_date,
                         "behind": bool(step.due_date and step.due_date < today and status not in DONE_STEP_STATUSES),
                         "count": by_step.get((int(goal.id), step.step_uuid), 0)})  # type: ignore[arg-type]
        plans.append({
            "goal_uuid": goal.goal_uuid, "title": goal.title, "status": _value(goal.status), "source": _value(goal.source),
            "count": by_goal.get(int(goal.id), 0),  # type: ignore[arg-type]
            "progress": {"done": sum(row["status"] in DONE_STEP_STATUSES for row in rows), "total": len(rows),
                         "submitted": sum(row["status"] == StepStatus.SUBMITTED.value for row in rows), "behind": sum(row["behind"] for row in rows)},
            "steps": rows,
        })
    return plans


def goal_chat(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    """Where a plan talks, for its chat button: the chat, or nothing yet while nobody else is on it."""
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "view_plan")
    conversation = chat_for_goal(db, goal)
    db.commit()
    member = db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == current_user.id)).first() if conversation else None
    topic = next((item for item in topics(db, conversation) if item["goal_uuid"] == goal_uuid), None) if conversation else None
    return {
        "goal_uuid": goal_uuid, "conversation_uuid": conversation.conversation_uuid if member else None,  # type: ignore[union-attr]
        "title": conversation.title if conversation else None, "can_post": bool(member) and can_post(db, conversation, current_user.id),  # type: ignore[arg-type]
        "counts": {row["step_uuid"]: row["count"] for row in (topic or {}).get("steps", [])}, "count": (topic or {}).get("count", 0),
    }


# Sending


def _bring_in(db: Session, current_user: PublicUser, goal: Goal, target: User, body: str) -> str:
    """Someone tagged who can't see the plan: invite them as a Commenter, or ask the plan's admins to."""
    from src.services.goals import sharing

    granted = access.capabilities(db, goal, current_user.id)
    try:
        if "manage_collaborators" in granted:
            sharing.create_invitation(db, current_user, goal.goal_uuid, PlanInvitationCreate(email=target.email, role_key=INVITE_ROLE))
            return "invited"
        if "request_collaborators" in granted:
            sharing.create_collaborator_request(db, current_user, goal.goal_uuid, PlanCollaboratorRequestCreate(email=target.email, role_key=INVITE_ROLE, message=body[:200]))
            return "requested"
    except HTTPException as error:
        # Already invited or already asked for: the earlier invitation or request still stands.
        if error.status_code == 409:
            return "invited" if "manage_collaborators" in granted else "requested"
        raise
    return "no_access"


def after_send(db: Session, current_user: PublicUser, conversation: Conversation, message: ConversationMessage) -> list[dict]:
    """What tagging people and organizations does: bring in people who can't see the plan, and tell a tagged organization."""
    if conversation.kind not in KINDS and not any(ref.get("kind") == "org" for ref in message.refs or []):
        return []
    members = {member.user_id for member in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)).all()}
    goals = {goal.goal_uuid: goal for goal in goals_in(db, conversation)}
    tagged = [goals[ref["goal_uuid"]] for ref in message.refs or [] if ref.get("goal_uuid") in goals]
    goal = tagged[0] if tagged else (next(iter(goals.values())) if len(goals) == 1 else None)
    outcomes = []
    for ref in message.refs or []:
        if ref.get("kind") == "user":
            user = db.exec(select(User).where(User.user_uuid == ref["user_uuid"])).first()
            if not user or user.id == current_user.id:
                continue
            status = "notified" if user.id in members else _bring_in(db, current_user, goal, user, message.body) if goal else "not_here"
            outcomes.append({"user": people.person(db, user.id), "status": status})
        elif ref.get("kind") == "org":
            _tell_org(db, current_user, conversation, message, ref["org_uuid"])
    return outcomes


def _tell_org(db: Session, current_user: PublicUser, conversation: Conversation, message: ConversationMessage, org_uuid: str) -> None:
    """A learner tagging one of their organizations in another chat shares that message into their chat with it."""
    org = db.exec(select(Organization).where(Organization.org_uuid == org_uuid)).first()
    target = school_chats.find(db, int(org.id), current_user.id) if org else None  # type: ignore[arg-type]
    if not target or target.id == conversation.id or not db.exec(select(ConversationMember).where(
        ConversationMember.conversation_id == target.id, ConversationMember.user_id == current_user.id,
    )).first():
        return
    where = conversation.title or ", ".join(item["name"] for item in (people.person(db, member.user_id) for member in db.exec(
        select(ConversationMember).where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id != current_user.id)
    ).all()) if item)
    card = {"type": ORG_MENTION, "from_chat": where, "excerpt": plain(db, message.body, message.refs)[:280]}
    chats.post(db, target, current_user.id, f"Tagged {org.name} in a chat with {where}" if where else f"Tagged {org.name}", kind="card", card=card)  # type: ignore[union-attr]


# Progress cards


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
            entry = {"step_uuid": step.step_uuid, "title": step.title, "event": event, "at": _stamp()}
            _post_progress(db, conversation, goal, actor_id or goal.subject_user_id, entry)


# Older goal comments


def _adopt_comments(db: Session, goal: Goal, conversation: Conversation) -> None:
    """Move a plan's comments from before plans talked in chats into its chat, tagged with their step."""
    rows = list(db.exec(select(GoalComment).where(GoalComment.goal_id == goal.id).order_by(col(GoalComment.id))).all())
    if not rows:
        return
    steps = {step.step_uuid for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()}
    newest = conversation.last_message_at or ""
    threads = {int(row.id): row.step_uuid for row in rows}  # type: ignore[arg-type]
    for row in rows:
        # A reply is on its thread's step.
        step_uuid = threads.get(int(row.parent_id)) if row.parent_id else row.step_uuid
        on_step = step_uuid if step_uuid in steps else None
        token = f"<step:{goal.goal_uuid}/{on_step}>" if on_step else f"<plan:{goal.goal_uuid}>"
        ref = {"kind": "step", "goal_uuid": goal.goal_uuid, "step_uuid": on_step} if on_step else {"kind": "plan", "goal_uuid": goal.goal_uuid}
        message = ConversationMessage(
            message_uuid=f"chat_message_{uuid4()}", conversation_id=int(conversation.id), sender_user_id=row.author_user_id,  # type: ignore[arg-type]
            kind="text", body=f"{token} {row.body}", refs=[ref], creation_date=row.creation_date, update_date=row.update_date or row.creation_date,
        )
        db.add(message)
        db.flush()
        attach(db, message, [(int(goal.id), on_step)])  # type: ignore[arg-type]
        newest = max(newest, message.update_date)
    # Replies first: they point at the comment they answer.
    for row in reversed(rows):
        db.delete(row)
    conversation.last_message_at = newest
    db.add(conversation)
    db.flush()
