"""Chats as the shared workspace on someone's plans.

Every plan with people on it talks in one chat. A plan an organization gave a learner (an
assignment, a badge) talks in the learner's chat with that organization, alongside their other
plans with it; a personal plan talks in a chat of its own once someone else is on it. A message
tags plans, steps, people and organizations inline as tokens (``<step:goal_uuid/step_uuid>``),
so the chat filters by plan and then by step: a comment on a step is just a message that tags
it. The app posts each plan's progress there as cards (see progress.py), and older goal comments move in the
first time their plan's chat is opened.
"""

from __future__ import annotations

import re
from datetime import date
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, func, select

from src.db.conversations import Conversation, ConversationMember, ConversationMessage, ConversationMessageRef
from src.db.goal_comments import GoalComment
from src.db.goals import DONE_STEP_STATUSES, Goal, GoalOwnership, GoalSource, GoalStage, GoalStatus, GoalStep, StepProgress, StepStatus
from src.db.organizations import Organization
from src.db.planning import PlanCollaborator, PlanCollaboratorRequestCreate, PlanInvitationCreate, PlanRole
from src.db.users import PublicUser, User
from src.services.connect import chats, cohort, people
from src.services.goals import access
from src.services.goals.sharing_roles import _stamp, org_summary
from src.services.school import chats as school_chats

GOAL = "goal"
KINDS = (school_chats.SCHOOL, GOAL)
# Chats with plans to filter by: a learner's and a plan's, and an assignment's cohort chats.
TOPIC_KINDS = (*KINDS, cohort.COHORT)
PROGRESS = "plan_progress"
ORG_MENTION = "org_mention"
TOKEN = re.compile(r"<(plan|step|user|org):([A-Za-z0-9_.-]+)(?:/([A-Za-z0-9_.-]+))?>")
# Plans a chat is about: waiting to be accepted, under way, or finished.
LIVE = (GoalStatus.PENDING.value, GoalStatus.ACTIVE.value, GoalStatus.FINISHED.value)
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
    if conversation.kind == cohort.COHORT:
        return cohort.can_post(db, conversation)
    if conversation.kind != GOAL:
        return True
    return any("comment" in access.capabilities(db, goal, user_id) for goal in goals_in(db, conversation))


# Tags in a message


def _step(db: Session, goal: Goal, step_uuid: str | None) -> GoalStep | None:
    return db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.step_uuid == step_uuid)).first() if step_uuid else None


def _taggable(db: Session, goal_uuid: str, sender_id: int | None) -> Goal | None:
    """A plan from outside the chat that its sender can see, so they can point to it here."""
    goal = db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).first() if sender_id else None
    return goal if goal and _value(goal.status) in LIVE and "view_plan" in access.capabilities(db, goal, int(sender_id)) else None  # type: ignore[arg-type]


def prepare(db: Session, conversation: Conversation, body: str, sender_id: int | None = None, scope: dict | None = None) -> tuple[str, list[dict], list[tuple[int | None, str | None]]]:
    """A message's text with only the tags that resolve here kept, what it tags, and the plan rows to filter it by.

    Plans outside the chat stay tagged when their sender can see them. ``scope`` is the plan or
    step the chat was filtered to: the message is about it without saying so in its text. A
    cohort chat's plan is its assignment, and its steps are the template's (see cohort.py).
    """
    goals = {goal.goal_uuid: goal for goal in goals_in(db, conversation)}
    in_cohort = conversation.kind == cohort.COHORT
    refs: list[dict] = []
    rows: list[tuple[int | None, str | None]] = []

    def add(ref: dict, goal: Goal | None = None, step_uuid: str | None = None) -> None:
        if not any({**item, "scope": False} == {**ref, "scope": False} for item in refs):
            refs.append(ref)
        row = (int(goal.id), step_uuid) if goal and goal.goal_uuid in goals else (None, step_uuid) if ref.get("cohort") and step_uuid else None  # type: ignore[arg-type]
        if row and row not in rows:
            rows.append(row)

    def keep(match: re.Match) -> str:
        kind, first, second = match.groups()
        ref: dict | None = None
        if kind in ("plan", "step") and in_cohort and (ref := cohort.tag(db, conversation, kind, first, second)):
            add(ref, step_uuid=ref.get("step_uuid"))
        elif kind in ("plan", "step"):
            goal = goals.get(first) or _taggable(db, first, sender_id)
            step = _step(db, goal, second) if goal and kind == "step" else None
            if goal and (kind == "plan" or step):
                ref = {"kind": kind, "goal_uuid": first, **({"step_uuid": second} if step else {}), **({} if first in goals else {"outside": True})}
                add(ref, goal, second if step else None)
        elif kind == "user" and db.exec(select(User.id).where(User.user_uuid == first)).first():
            add(ref := {"kind": "user", "user_uuid": first})
        elif kind == "org" and db.exec(select(Organization.id).where(Organization.org_uuid == first)).first():
            add(ref := {"kind": "org", "org_uuid": first})
        return match.group(0) if ref else ""

    text = re.sub(r"[ \t]{2,}", " ", TOKEN.sub(keep, body)).strip()
    goal = goals.get((scope or {}).get("goal_uuid") or "")
    step = _step(db, goal, (scope or {}).get("step_uuid")) if goal else None
    if goal:
        add({"kind": "step" if step else "plan", "goal_uuid": goal.goal_uuid, **({"step_uuid": step.step_uuid} if step else {}), "scope": True}, goal, step.step_uuid if step else None)
    # A cohort chat is all about its assignment's plan, so only a step needs saying.
    scoped = cohort.tag(db, conversation, "step", scope["goal_uuid"], scope.get("step_uuid")) if in_cohort and scope and scope.get("goal_uuid") and scope.get("step_uuid") else None
    if scoped:
        add({**scoped, "scope": True}, step_uuid=scoped["step_uuid"])
    return text, refs, rows


def attach(db: Session, message: ConversationMessage, rows: list[tuple[int | None, str | None]]) -> None:
    for goal_id, step_uuid in rows:
        db.add(ConversationMessageRef(message_id=int(message.id), conversation_id=message.conversation_id, goal_id=goal_id, step_uuid=step_uuid))  # type: ignore[arg-type]
    db.flush()


def _step_status(db: Session, step: GoalStep) -> str:
    progress = db.exec(select(StepProgress.status).where(StepProgress.step_id == step.id)).first()
    return _value(progress) if progress else StepStatus.NOT_STARTED.value


def resolve(db: Session, refs: list[dict] | None, cache: dict, viewer_id: int | None = None) -> list[dict]:
    """Tags as the reader sees them now: current titles, names and states. Gone things drop out.

    A plan from outside the chat shows only to readers it's shared with; others see that it's private.
    """
    resolved: list[dict] = []
    for ref in refs or []:
        kind = ref.get("kind")
        key = f"{kind}:{ref.get('goal_uuid') or ref.get('user_uuid') or ref.get('org_uuid')}" + (f"/{ref['step_uuid']}" if ref.get("step_uuid") else "")
        if key not in cache:
            found = _resolve_one(db, ref)
            if found and ref.get("outside"):
                goal = db.exec(select(Goal).where(Goal.goal_uuid == ref["goal_uuid"])).first()
                shown = bool(goal and viewer_id and "view_plan" in access.capabilities(db, goal, viewer_id))
                found = {**found, "outside": True} if shown else {"kind": kind, "goal_uuid": ref["goal_uuid"], "title": "Private plan", "hidden": True, "outside": True}
            cache[key] = found
        if cache[key]:
            resolved.append({**cache[key], "key": key, **({"scope": True} if ref.get("scope") else {})})
    return resolved


def _resolve_one(db: Session, ref: dict) -> dict | None:
    kind = ref.get("kind")
    if kind in ("plan", "step") and ref.get("cohort"):
        return cohort.resolve_one(db, ref)
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


def plain(db: Session, body: str, refs: list[dict] | None, viewer_id: int | None = None) -> str:
    """A message with its tags written out as their names, for previews."""
    names = {item["key"]: item for item in resolve(db, refs, {}, viewer_id)}

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
    if conversation.kind == cohort.COHORT:
        return cohort.filtered(query, db, conversation, goal_uuid, step_uuid)
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


def topic(db: Session, goal: Goal, by_step: dict | None = None, count: int = 0) -> dict:
    """One plan to filter by or tag: its steps, where they stand, and how many messages tag each."""
    today = date.today()
    steps = _ordered_steps(db, goal)
    statuses = {int(step_id): _value(status) for step_id, status in db.exec(
        select(StepProgress.step_id, StepProgress.status).where(col(StepProgress.step_id).in_([step.id for step in steps]))
    ).all()} if steps else {}
    rows = []
    for step in steps:
        status = statuses.get(int(step.id), StepStatus.NOT_STARTED.value)  # type: ignore[arg-type]
        rows.append({"step_uuid": step.step_uuid, "title": step.title, "status": status, "due_date": step.due_date,
                     "behind": bool(step.due_date and step.due_date < today and status not in DONE_STEP_STATUSES),
                     "count": (by_step or {}).get((int(goal.id), step.step_uuid), 0)})  # type: ignore[arg-type]
    return {
        "goal_uuid": goal.goal_uuid, "title": goal.title, "status": _value(goal.status), "source": _value(goal.source), "count": count,
        "progress": {"done": sum(row["status"] in DONE_STEP_STATUSES for row in rows), "total": len(rows),
                     "submitted": sum(row["status"] == StepStatus.SUBMITTED.value for row in rows), "behind": sum(row["behind"] for row in rows)},
        "steps": rows,
    }


def topics(db: Session, conversation: Conversation) -> list[dict]:
    """The plans this chat is about, each with its steps, where they stand, and how many messages tag them."""
    if conversation.kind == cohort.COHORT:
        return [item for item in [cohort.topic(db, conversation)] if item]
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
    return [topic(db, goal, by_step, by_goal.get(int(goal.id), 0)) for goal in goals]  # type: ignore[arg-type]


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
