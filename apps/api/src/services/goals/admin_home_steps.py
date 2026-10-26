"""First steps for staff: a short lap of the places they'll work, built from their permissions and assignments.

Admins get the org setup checklist instead (``admin_home_start``). A staff member's steps, in order:

- ``profile``: their name is set (the profile step after joining does it).
- ``brief`` (on an assignment): look through the assignment, or each of them. Ticks when opened.
- ``try`` (on an assignment): try the step its learners are on. Ticks when opened.
- ``hello``: say hello to the group they're on, or to the team in the Staff thread. Done once they've posted a message in this org.
- ``review`` (reviews work, on an assignment): done once they've confirmed a step or asked for changes.
- ``plans`` (builds plans): open a draft in Plans. ``preview`` (builds plans, no assignment): try a plan as a learner. Tick when opened.
- ``people`` (manages learners): find your learners in Threads. Ticks when opened.
- ``insights`` (sees reports): pin an insight card to Home. Done once they have a pin.

Steps that data can't show tick when the step is opened; those ticks live in the member's Home state.
"""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.conversations import Conversation, ConversationMessage
from src.db.goals import CompletionMethod, GoalAssignment, StepProgress, StepStatus
from src.db.users import User
from src.services.goals.admin_home_sections import role_on

TICKED = ("brief", "try", "plans", "preview", "people")
STEP_KEYS = ("profile", "brief", "try", "hello", "review", "plans", "preview", "people", "insights")


def _posted(db: Session, user_id: int, org_id: int) -> bool:
    return db.exec(select(ConversationMessage.id).join(Conversation, col(Conversation.id) == ConversationMessage.conversation_id)
                   .where(ConversationMessage.sender_user_id == user_id, Conversation.org_id == org_id).limit(1)).first() is not None


def _reviewed(db: Session, user_id: int) -> bool:
    confirmed = select(StepProgress.id).where(StepProgress.completed_by_user_id == user_id, StepProgress.completion_method == CompletionMethod.STAFF.value)
    sent_back = select(StepProgress.id).where(StepProgress.updated_by_user_id == user_id, StepProgress.status == StepStatus.CHANGES_REQUESTED.value)
    return db.exec(confirmed.limit(1)).first() is not None or db.exec(sent_back.limit(1)).first() is not None


def _focus(summaries: list[dict]) -> dict | None:
    """What the steps name: the first assignment the viewer is on, who it's for and the stage it's at."""
    if not summaries:
        return None
    first = summaries[0]
    return {"assignment_uuid": first["assignment_uuid"], "target": first["target"], "plan": first["plan"]["title"],
            "template_uuid": first["plan"]["template_uuid"], "stage": (first.get("stage") or {}).get("title"), "count": len(summaries)}


def staff_steps(db: Session, user_id: int, org_id: int, permissions: set[str], mine: list[GoalAssignment], summaries: list[dict], state: dict) -> dict:
    """The viewer's steps, which are done, and what they name."""
    user = db.get(User, user_id)
    on = bool(mine)
    reviews = on and "review_work" in permissions and any(role_on(row, user_id) != "comment" for row in mine)
    keys = ["profile", *(["brief", "try"] if on else []), "hello", *(["review"] if reviews else []),
            *(["plans"] if "build_plans" in permissions else []), *(["preview"] if "build_plans" in permissions and not on else []),
            *(["people"] if "manage_learners" in permissions else []), *(["insights"] if "see_reports" in permissions else [])]
    ticks = set(state.get("ticks") or [])
    done = {
        "profile": bool(user and (user.first_name or "").strip()),
        "hello": _posted(db, user_id, org_id),
        "review": reviews and _reviewed(db, user_id),
        "insights": bool(state.get("pins")),
        **{key: key in ticks for key in TICKED},
    }
    steps = [{"key": key, "done": bool(done[key]), "optional": False} for key in keys]
    return {"kind": "staff", "steps": steps, "done": sum(step["done"] for step in steps), "total": len(steps), "focus": _focus(summaries)}
