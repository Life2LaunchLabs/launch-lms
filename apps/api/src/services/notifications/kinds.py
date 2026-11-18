"""How each kind of notification reads: one line with a link, a subject when it's the only one in its email,
and whether it's still worth sending by the time the email goes out.

Lines are HTML-safe. Links are absolute, onto the organization's site. Copy names people (the
person who handed in, the reviewer as learners see them) and never says "learner".
"""

from __future__ import annotations

import html
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlencode

from sqlmodel import Session, select

from src.db.goals import GoalStep, StepProgress, StepStatus
from src.db.notifications import NotificationEvent
from src.db.organizations import Organization
from src.services.oauth.config import frontend_url


@dataclass(frozen=True)
class Item:
    line: str  # HTML
    link: str
    link_label: str
    subject: str


def _org_path(org: Organization | None, path: str) -> str:
    return f"{frontend_url()}/orgs/{org.slug}{path}" if org else f"{frontend_url()}{path}"


def _e(value) -> str:
    return html.escape(str(value or ""))


def _step_submitted(event: NotificationEvent, org: Organization | None) -> Item:
    data = event.data
    query = {key: value for key, value in (("assignment", data.get("assignment_uuid")), ("step_key", data.get("step_key")), ("focus", data.get("step_uuid"))) if value}
    if not data.get("step_key") and data.get("step_uuid"):
        query["step"] = data["step_uuid"]
    # The review screen for that step, opened on this hand-in (as the Needs you row does).
    link = _org_path(org, f"/admin/plans/review?{urlencode(query)}") if data.get("assignment_uuid") else _org_path(org, "/admin")
    who, step, plan = data.get("person_name") or "Someone", data.get("step_title") or "a step", data.get("plan_title") or ""
    in_plan = f" in <b>{_e(plan)}</b>" if plan else ""
    return Item(line=f"{_e(who)} handed in <b>{_e(step)}</b>{in_plan}.", link=link, link_label="Review it",
                subject=f"{who} handed in {step}")


def _step_reviewed(approved: bool) -> Callable[[NotificationEvent, Organization | None], Item]:
    def render(event: NotificationEvent, org: Organization | None) -> Item:
        data = event.data
        link = _org_path(org, f"/plans/{data['goal_uuid']}") if data.get("goal_uuid") else _org_path(org, "/plans")
        who, step, plan = data.get("reviewer_name") or "Your reviewer", data.get("step_title") or "your work", data.get("plan_title") or ""
        in_plan = f" in <b>{_e(plan)}</b>" if plan else ""
        note = (data.get("note") or "").strip()
        said = f"<br><span style=\"color:#555\">“{_e(note)}”</span>" if note else ""
        if approved:
            return Item(line=f"{_e(who)} approved <b>{_e(step)}</b>{in_plan}.{said}", link=link, link_label="See your plan",
                        subject=f"{step} was approved")
        return Item(line=f"{_e(who)} sent <b>{_e(step)}</b>{in_plan} back with changes to make.{said}", link=link, link_label="See what to change",
                    subject=f"Changes to make on {step}")
    return render


def _plan_assigned(event: NotificationEvent, org: Organization | None) -> Item:
    data = event.data
    plan, giver = data.get("plan_title") or "A new plan", (org.name if org else "") or "An organization"
    # Opens Plans with this goal named, so signed out it says which school and plan it is (DEV-42).
    link = _org_path(org, f"/plans?{urlencode({'invited': data['goal_uuid']})}") if data.get("goal_uuid") else _org_path(org, "/plans")
    return Item(line=f"{_e(giver)} gave you <b>{_e(plan)}</b> to start.", link=link, link_label="See the plan",
                subject=f"{giver} gave you {plan}")


def _support_requested(event: NotificationEvent, org: Organization | None) -> Item:
    school = (org.name if org else "") or "Your school"
    # Their Education Plan, which shows the request with Yes and Not now (DEV-111).
    link = _org_path(org, f"/epp?{urlencode({'org': org.slug})}") if org else _org_path(org, "/epp")
    return Item(line=f"{_e(school)} would like to support your Education Plan and Profile. You can say yes or not now.",
                link=link, link_label="See the request", subject=f"{school} would like to support your Education Plan")


def _seat_limit_reached(event: NotificationEvent, org: Organization | None) -> Item:
    data = event.data
    school = (org.name if org else "") or "Your organization"
    who = data.get("person_name") or "Someone"
    where = f" ({_e(data.get('course_title'))})" if data.get("course_title") else ""
    if data.get("seat") == "staff_seats":
        line = (f"{_e(who)} tried to open Life2Launch from Canvas{where} as staff, but {_e(school)} has used all its "
                "staff seats. Free a seat, or request a higher tier.")
    else:
        line = (f"{_e(who)} tried to open Life2Launch from Canvas{where}, but {_e(school)} has reached its learner "
                "limit. Mark learners who have moved on as alumni, or request a higher tier.")
    return Item(line=line, link=_org_path(org, "/admin/org/settings/plan"), link_label="See your plan and limits",
                subject=f"{school} is full: someone couldn't open Life2Launch from Canvas")


def _step_status(db: Session, event: NotificationEvent) -> str | None:
    step = db.exec(select(GoalStep).where(GoalStep.step_uuid == event.data.get("step_uuid"))).first()
    if not step:
        return None
    status = db.exec(select(StepProgress.status).where(StepProgress.step_id == step.id)).first()
    return getattr(status, "value", status)


def _still_waiting(db: Session, event: NotificationEvent) -> bool:
    """A hand-in someone already reviewed (or the person took back) isn't worth an email."""
    return _step_status(db, event) == StepStatus.SUBMITTED.value


def _support_still_open(db: Session, event: NotificationEvent) -> bool:
    """A request they already answered (or that was replaced or withdrawn) isn't worth an email."""
    from src.db.learner_support import LearnerSupport

    row = db.exec(select(LearnerSupport).where(LearnerSupport.support_uuid == event.data.get("support_uuid"))).first()
    return bool(row and row.status == "requested" and row.request_uuid == event.data.get("request_uuid"))


def _always(db: Session, event: NotificationEvent) -> bool:
    return True


RENDER: dict[str, Callable[[NotificationEvent, Organization | None], Item]] = {
    "step_submitted": _step_submitted,
    "step_approved": _step_reviewed(True),
    "step_sent_back": _step_reviewed(False),
    "plan_assigned": _plan_assigned,
    "support_requested": _support_requested,
    "seat_limit_reached": _seat_limit_reached,
}

STILL_RELEVANT: dict[str, Callable[[Session, NotificationEvent], bool]] = {
    "step_submitted": _still_waiting,
    "support_requested": _support_still_open,
}


def still_relevant(db: Session, event: NotificationEvent) -> bool:
    return STILL_RELEVANT.get(event.kind, _always)(db, event)


# The subject when one email carries several, by stream.
DIGEST_SUBJECTS: dict[str, Callable[[int], str]] = {
    "review_requests": lambda count: f"{count} hand-ins waiting for your review",
    "review_results": lambda count: f"{count} reviews of your work",
    "new_plans": lambda count: f"{count} new plans for you",
    "school_requests": lambda count: f"{count} schools would like to support your plan",
    "org_alerts": lambda count: f"{count} alerts about your organization",
}
