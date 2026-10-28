"""Capture rules: capture a dashboard weekly, monthly or once on a date, and tell people it's ready.

A rule runs as its owner, so its captures count the learners the owner can see, exactly as if they pressed
Capture. Staff recipients must be able to open the capture (See reports and the dashboard), and get a link
into Insights; any other address gets the capture's read-only link, so a rule with addresses always makes one.
A rule that can no longer run (the owner lost access, the plan or group is gone) turns itself off and says why.

``run_due`` is called by the worker every few minutes; on Postgres it claims rules with ``SKIP LOCKED`` so two
API processes never run the same rule twice.
"""

from __future__ import annotations

import calendar
import html
import logging
import secrets
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, col, select

from src.db.insights import InsightCapture, InsightCaptureRule, InsightDashboard
from src.db.organizations import Organization
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, is_org_owner_admin
from src.services.email.utils import send_email
from src.services.insights import captures, dashboards
from src.services.insights.context import population, scope
from src.services.insights.spec import CustomRange
from src.services.oauth.config import frontend_url

logger = logging.getLogger(__name__)

CADENCES = ("weekly", "monthly", "once")
RUN_HOUR = 6  # UTC: early in the morning for the Americas and Europe alike.
MAX_RECIPIENTS = 20
DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


class RuleIn(BaseModel):
    key: str | None = Field(default=None, max_length=200)
    cadence: str = "monthly"
    day: int = Field(default=1, ge=0, le=28)
    on_date: date | None = None
    range: Literal["28d", "90d", "12m", "all"] | CustomRange | None = None
    note: str = Field(default="", max_length=2000)
    staff: list[str] = Field(default_factory=list, max_length=MAX_RECIPIENTS)
    emails: list[EmailStr] = Field(default_factory=list, max_length=MAX_RECIPIENTS)
    link_days: int | None = None
    enabled: bool = True


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="seconds")


def next_run(rule: InsightCaptureRule, after: datetime) -> datetime | None:
    """The first run strictly after ``after``, at RUN_HOUR UTC on the rule's day; none once a one-off has run."""
    def at(day: date) -> datetime:
        return datetime.combine(day, time(RUN_HOUR), tzinfo=timezone.utc)

    if rule.cadence == "once":
        when = at(date.fromisoformat(rule.on_date)) if rule.on_date else None
        return when if when and when > after else None
    if rule.cadence == "weekly":
        day = after.date()
        for _ in range(8):
            if day.weekday() == rule.day and at(day) > after:
                return at(day)
            day += timedelta(days=1)
        return None
    year, month = after.year, after.month
    for _ in range(3):
        last = calendar.monthrange(year, month)[1]
        when = at(date(year, month, last if rule.day == 0 else min(rule.day, last)))
        if when > after:
            return when
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return None


def describe(rule: InsightCaptureRule) -> str:
    if rule.cadence == "weekly":
        return f"Every {DAYS[rule.day]}"
    if rule.cadence == "monthly":
        return "On the last day of each month" if rule.day == 0 else f"On day {rule.day} of each month"
    return f"Once, on {rule.on_date}"


def _people(db: Session, ids: list[int]) -> dict[int, User]:
    return {int(user.id): user for user in db.exec(select(User).where(col(User.id).in_(ids))).all()} if ids else {}  # type: ignore[arg-type]


def _read(db: Session, rule: InsightCaptureRule, viewer: dict) -> dict:
    staff = _people(db, [int(item) for item in rule.staff_user_ids or []])
    owner = db.get(User, rule.owner_user_id) if rule.owner_user_id else None
    dashboard = db.get(InsightDashboard, rule.dashboard_id)
    return {
        "rule_uuid": rule.rule_uuid, "dashboard_uuid": dashboard.dashboard_uuid if dashboard else None, "title": dashboard.title if dashboard else "",
        "scope": dashboard.scope if dashboard else "org", "key": rule.object_key, "cadence": rule.cadence, "day": rule.day, "on_date": rule.on_date,
        "range": rule.range, "note": rule.note, "summary": describe(rule),
        "staff": [{"user_uuid": user.user_uuid, "name": captures._name(user)} for user in staff.values()], "emails": rule.emails, "link_days": rule.link_days,
        "enabled": rule.enabled, "next_run_at": rule.next_run_at, "last_run_at": rule.last_run_at, "last_error": rule.last_error,
        "owner": captures._name(owner), "mine": rule.owner_user_id == viewer["id"], "editable": rule.owner_user_id == viewer["id"] or viewer["admin"],
    }


def _can_open(db: Session, user_id: int, org_id: int, dashboard: InsightDashboard) -> bool:
    viewer = {"id": user_id, "admin": is_org_owner_admin(user_id, org_id, db), "see_reports": is_org_admin(user_id, org_id, db, "see_reports")}
    return viewer["see_reports"] and dashboards._visible(dashboard, viewer)


def _apply(db: Session, rule: InsightCaptureRule, data: RuleIn, dashboard: InsightDashboard, owner_id: int, org_id: int) -> None:
    if data.cadence not in CADENCES:
        raise HTTPException(status_code=422, detail=f"How often is one of: {', '.join(CADENCES)}")
    if data.cadence == "weekly" and data.day > 6:
        raise HTTPException(status_code=422, detail="A weekly capture runs on a day of the week (0 is Monday)")
    if data.cadence == "once" and (data.on_date is None or data.on_date < _now().date()):
        raise HTTPException(status_code=422, detail="Pick a date from today on")
    if dashboard.scope != "org" and not data.key:
        raise HTTPException(status_code=422, detail=f"Pick the {dashboard.scope} to capture")
    if data.link_days is not None and data.link_days not in captures.LINK_DAYS:
        raise HTTPException(status_code=422, detail=f"A link lasts {', '.join(map(str, captures.LINK_DAYS))} days, or until it's turned off")
    users = db.exec(select(User).where(col(User.user_uuid).in_(data.staff))).all() if data.staff else []
    if len(users) != len(set(data.staff)):
        raise HTTPException(status_code=422, detail="Someone on the list isn't in this organization")
    blocked = [captures._name(user) for user in users if int(user.id) != owner_id and not _can_open(db, int(user.id), org_id, dashboard)]  # type: ignore[arg-type]
    if blocked:
        raise HTTPException(status_code=422, detail=f"{', '.join(blocked)} can't open this dashboard's captures (they need See reports and the dashboard shared with them)")
    rule.object_key = data.key if dashboard.scope != "org" else None
    rule.cadence, rule.day = data.cadence, data.day
    rule.on_date = data.on_date.isoformat() if data.on_date else None
    rule.range = {"preset": data.range} if isinstance(data.range, str) else (data.range.model_dump(mode="json") if data.range else None)
    rule.note, rule.enabled = data.note.strip(), data.enabled
    rule.staff_user_ids = [int(user.id) for user in users]  # type: ignore[arg-type]
    rule.emails = sorted({str(item).lower() for item in data.emails})
    rule.link_days = data.link_days
    rule.next_run_at = (_iso(when) if (when := next_run(rule, _now())) else None) if rule.enabled else None
    rule.last_error = "" if rule.enabled else rule.last_error
    rule.update_date = _iso(_now())


def _rule(db: Session, org_id: int, rule_uuid: str, viewer: dict, *, edit: bool = False) -> InsightCaptureRule:
    rule = db.exec(select(InsightCaptureRule).where(InsightCaptureRule.rule_uuid == rule_uuid, InsightCaptureRule.org_id == org_id)).first()
    dashboard = db.get(InsightDashboard, rule.dashboard_id) if rule else None
    if rule is None or dashboard is None or not (rule.owner_user_id == viewer["id"] or (viewer["see_reports"] and dashboards._visible(dashboard, viewer))):
        raise HTTPException(status_code=404, detail="Schedule not found")
    if edit and rule.owner_user_id != viewer["id"] and not viewer["admin"]:
        raise HTTPException(status_code=403, detail="Only its owner or an admin can change this schedule")
    return rule


def list_rules(db: Session, user: PublicUser, org_id: int, dashboard_uuid: str | None = None) -> list[dict]:
    viewer = dashboards._viewer(db, user, org_id)
    query = select(InsightCaptureRule, InsightDashboard).join(InsightDashboard, InsightDashboard.id == InsightCaptureRule.dashboard_id).where(
        InsightCaptureRule.org_id == org_id, col(InsightDashboard.deleted_at).is_(None))
    if dashboard_uuid:
        query = query.where(InsightDashboard.dashboard_uuid == dashboard_uuid)
    rows = db.exec(query.order_by(col(InsightCaptureRule.id))).all()
    return [_read(db, rule, viewer) for rule, board in rows
            if rule.owner_user_id == viewer["id"] or (viewer["see_reports"] and dashboards._visible(board, viewer))]


def create_rule(db: Session, user: PublicUser, org_id: int, dashboard_uuid: str, data: RuleIn) -> dict:
    viewer = dashboards._viewer(db, user, org_id)
    dashboard = dashboards._get(db, org_id, dashboard_uuid, viewer)
    if data.key:
        _check_object(db, user, org_id, dashboard.scope, data.key)
    now = _iso(_now())
    rule = InsightCaptureRule(rule_uuid=f"rule_{uuid4()}", org_id=org_id, dashboard_id=int(dashboard.id), owner_user_id=user.id,  # type: ignore[arg-type]
                              cadence=data.cadence, creation_date=now, update_date=now)
    _apply(db, rule, data, dashboard, user.id, org_id)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _read(db, rule, viewer)


def _check_object(db: Session, user: PublicUser, org_id: int, kind: str, key: str) -> None:
    """The plan or group must be one the owner can open now (404 otherwise)."""
    scope(db, population(db, user, org_id), kind, key)


def update_rule(db: Session, user: PublicUser, org_id: int, rule_uuid: str, data: RuleIn) -> dict:
    viewer = dashboards._viewer(db, user, org_id)
    rule = _rule(db, org_id, rule_uuid, viewer, edit=True)
    dashboard = db.get(InsightDashboard, rule.dashboard_id)
    owner = db.get(User, rule.owner_user_id) if rule.owner_user_id else None
    if data.key and owner:
        _check_object(db, PublicUser(**owner.model_dump()), org_id, dashboard.scope, data.key)  # type: ignore[union-attr]
    _apply(db, rule, data, dashboard, rule.owner_user_id or user.id, org_id)  # type: ignore[arg-type]
    db.add(rule)
    db.commit()
    return _read(db, rule, viewer)


def delete_rule(db: Session, user: PublicUser, org_id: int, rule_uuid: str) -> dict:
    """Stops the schedule; the captures it made stay."""
    viewer = dashboards._viewer(db, user, org_id)
    rule = _rule(db, org_id, rule_uuid, viewer, edit=True)
    db.delete(rule)
    db.commit()
    return {"deleted": True}


def run_now(db: Session, user: PublicUser, org_id: int, rule_uuid: str) -> dict:
    """Run a schedule straight away (to try it), without moving its next run."""
    viewer = dashboards._viewer(db, user, org_id)
    rule = _rule(db, org_id, rule_uuid, viewer, edit=True)
    capture = run(db, rule, reschedule=False)
    if capture is None:
        raise HTTPException(status_code=409, detail=rule.last_error or "It couldn't run")
    return {"capture_uuid": capture.capture_uuid, "rule": _read(db, rule, viewer)}


# Running ------------------------------------------------------------------------------------------

def run(db: Session, rule: InsightCaptureRule, *, reschedule: bool = True) -> InsightCapture | None:
    """Capture as the owner and send it. A rule that can't run turns itself off with the reason."""
    now = _now()
    dashboard = db.get(InsightDashboard, rule.dashboard_id)
    owner = db.get(User, rule.owner_user_id) if rule.owner_user_id else None
    capture = None
    try:
        if dashboard is None or dashboard.deleted_at:
            raise HTTPException(status_code=404, detail="Its dashboard was deleted")
        if owner is None:
            raise HTTPException(status_code=404, detail="Its owner's account is gone")
        as_owner = PublicUser(**owner.model_dump())
        range_ = rule.range["preset"] if rule.range and "preset" in rule.range else rule.range
        capture = captures.make(db, as_owner, rule.org_id, dashboard, key=rule.object_key, range_=range_, note=rule.note, rule_id=rule.id)
        if rule.emails:
            capture.link_token = secrets.token_urlsafe(24)
            capture.link_expires_at = _iso(now + timedelta(days=rule.link_days)) if rule.link_days else None
            db.add(capture)
            db.commit()
        deliver(db, rule, capture)
        rule.last_error = ""
    except HTTPException as error:
        db.rollback()
        rule.enabled, rule.next_run_at = False, None
        rule.last_error = error.detail if isinstance(error.detail, str) else "It couldn't run"
        logger.info("Capture rule %s turned off: %s", rule.rule_uuid, rule.last_error)
    rule.last_run_at = _iso(now) if capture else rule.last_run_at
    if reschedule and rule.enabled:
        when = next_run(rule, now)
        rule.next_run_at = _iso(when) if when else None
        rule.enabled = when is not None
    rule.update_date = _iso(now)
    db.add(rule)
    db.commit()
    return capture


def deliver(db: Session, rule: InsightCaptureRule, capture: InsightCapture) -> None:
    """Email staff a link into Insights, and every other address the read-only link. Failures are logged, not raised."""
    org = db.get(Organization, rule.org_id)
    if org is None:
        return
    base = f"{frontend_url()}/orgs/{org.slug}"
    staff = [user for user in _people(db, [int(item) for item in rule.staff_user_ids or []]).values() if user.email]
    sends = [(str(user.email), f"{base}/admin/insights/captures/{capture.capture_uuid}") for user in staff]
    if capture.link_token:
        sends += [(email, f"{base}/insights/shared/{capture.link_token}") for email in rule.emails if email not in {address for address, _ in sends}]
    subject = f"{capture.title}{f': {capture.object_label}' if capture.object_label else ''}"
    for address, link in sends:
        try:
            send_email(to=address, subject=subject, body=_body(org, capture, link))
        except Exception:
            logger.exception("Couldn't send capture %s to %s", capture.capture_uuid, address)


def _body(org: Organization, capture: InsightCapture, link: str) -> str:
    """The headlines, as plain sentences, and the link. Outside addresses only ever get the link's shielded view."""
    start, end = capture.range.get("start"), capture.range.get("end")
    dates = f"{start} to {end}" if start else f"up to {end}"
    results = capture.results or {}
    shown = [captures.shield(results[card["key"]], card.get("spec")) for card in capture.cards or [] if "error" not in results.get(card.get("key"), {"error": 1})]
    lines = "".join(f"<li>{html.escape(str(result.get('headline', '')))}</li>" for result in shown)
    note = f"<p>{html.escape(capture.note)}</p>" if capture.note else ""
    return f"""
<html>
    <body>
        <p><b>{html.escape(capture.title)}</b>{f' · {html.escape(capture.object_label)}' if capture.object_label else ''} · {html.escape(dates)}</p>
        {note}
        <ul>{lines}</ul>
        <p><a href="{link}">See it in full</a></p>
        <p style="color:#777">Captured by {html.escape(org.name)} on a schedule in Launch LMS. Numbers under ten are hidden here.</p>
    </body>
</html>
"""


def due(db: Session, now: datetime, limit: int = 20) -> list[InsightCaptureRule]:
    query = select(InsightCaptureRule).where(InsightCaptureRule.enabled == True, col(InsightCaptureRule.next_run_at).is_not(None),  # noqa: E712
                                             col(InsightCaptureRule.next_run_at) <= _iso(now)).order_by(col(InsightCaptureRule.next_run_at)).limit(limit)
    if db.get_bind().dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)
    return list(db.exec(query).all())


def claim(db: Session, now: datetime) -> list[int]:
    """Take every due rule and move its next run on, in one commit, before running any of them.

    Moving them first means a second process (or a slow run) never picks the same rule up again; a one-off
    turns off here. The locks only last for this commit.
    """
    rules = due(db, now)
    for rule in rules:
        when = next_run(rule, now)
        rule.next_run_at, rule.enabled = (_iso(when) if when else None), when is not None
        db.add(rule)
    db.commit()
    return [int(rule.id) for rule in rules]  # type: ignore[arg-type]


def run_due(engine) -> int:
    """Run every rule that is due; returns how many ran."""
    ran = 0
    with Session(engine) as db:
        for rule_id in claim(db, _now()):
            rule = db.get(InsightCaptureRule, rule_id)
            try:
                if rule and run(db, rule, reschedule=False):
                    ran += 1
            except Exception:
                db.rollback()
                logger.exception("Capture rule %s failed", rule_id)
    return ran


async def run_forever(engine, every: int = 300) -> None:
    """The scheduler: started with the app, wakes every few minutes."""
    import asyncio

    while True:
        try:
            await asyncio.to_thread(run_due, engine)
        except Exception:
            logger.exception("Running capture rules failed; will retry")
        await asyncio.sleep(every)
