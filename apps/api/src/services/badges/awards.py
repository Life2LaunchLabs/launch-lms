"""Badges learners earn, kept in their portfolio.

A learner earns a plan's badge by finishing the plan with an organization that
runs it (the plan's owner, or one approved to run it), on a release that has a
badge. Each award keeps the achievement as it was earned. A learner holds a
plan's badge once: finishing the plan again, or later finishing a plan whose
badge they were awarded directly, makes no second award. Staff of the issuing
organization can revoke an award; a revoked award stays on record (and on its
public page, marked revoked) but no longer counts, so the badge can be earned again.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import uuid4

from sqlmodel import Session, col, func, select

from src.db.badges import AwardSource, AwardStatus, BadgeAward
from src.db.goals import DONE_STEP_STATUSES, Goal, GoalStatus, GoalStep, GoalTemplate, GoalTemplateVersion, StepProgress
from src.db.organizations import Organization
from src.db.users import User
from src.services.badges import open_badges
from src.services.badges.definition import achievement, goal_badge, summary


def _now() -> str:
    return datetime.now().isoformat()


def held(db: Session, template_id: int | None, user_id: int | None) -> BadgeAward | None:
    if not template_id or not user_id:
        return None
    return db.exec(select(BadgeAward).where(BadgeAward.template_id == template_id, BadgeAward.user_id == user_id, BadgeAward.status == AwardStatus.ACTIVE.value)).first()


def holders(db: Session, template_id: int, user_ids: list[int]) -> dict[int, BadgeAward]:
    """User id -> their award of this plan's badge, for the users given."""
    if not user_ids:
        return {}
    rows = db.exec(select(BadgeAward).where(BadgeAward.template_id == template_id, col(BadgeAward.user_id).in_(user_ids), BadgeAward.status == AwardStatus.ACTIVE.value)).all()
    return {int(row.user_id): row for row in rows}


def runs_plan(db: Session, template: GoalTemplate, org_id: int | None) -> bool:
    """The plan's owner, or an organization approved to run it."""
    from src.services.goals.plan_issuers import approved_on

    return org_id is not None and approved_on(db, template.id, org_id)


def award_for_goal(db: Session, goal: Goal) -> BadgeAward | None:
    """Award the badge of the release the goal was issued from, when it has one (flushed, not committed)."""
    template = db.get(GoalTemplate, goal.template_id) if goal.template_id else None
    version = db.get(GoalTemplateVersion, goal.version_id) if goal.version_id else None
    if template is None or version is None or not goal.subject_user_id or not runs_plan(db, template, goal.org_id):
        return None
    earned = achievement(db, template, version.document or {}, version.semver)
    if earned is None or held(db, template.id, goal.subject_user_id):
        return None
    award = new_award(template, version, earned, int(goal.subject_user_id), goal.org_id, AwardSource.PLAN_COMPLETION, goal_id=goal.id)
    db.add(award)
    db.flush()
    open_badges.issue(db, award)
    return award


def new_award(template: GoalTemplate, version: GoalTemplateVersion | None, earned: dict, user_id: int, issuing_org_id: int | None,
              source: AwardSource, **values) -> BadgeAward:
    now = _now()
    return BadgeAward(
        award_uuid=f"award_{uuid4()}", template_id=template.id, version_id=version.id if version else None, semver=version.semver if version else None,
        user_id=user_id, issuing_org_id=issuing_org_id, creator_org_id=template.org_id, source=source, achievement=earned,
        earned_on=values.pop("earned_on", None) or date.today(), issued_at=datetime.utcnow(), creation_date=now, update_date=now, **values,
    )


def _org(db: Session, org_id: int | None) -> dict | None:
    org = db.get(Organization, org_id) if org_id else None
    return {"id": org.id, "org_uuid": org.org_uuid, "slug": org.slug, "name": org.name, "logo_image": org.logo_image} if org else None


def award_dict(db: Session, award: BadgeAward) -> dict:
    template = db.get(GoalTemplate, award.template_id) if award.template_id else None
    awarded_by = db.get(User, award.awarded_by_user_id) if award.awarded_by_user_id else None
    learner = db.get(User, award.user_id)
    return {
        "award_uuid": award.award_uuid,
        "template_uuid": template.template_uuid if template else None,
        "semver": award.semver,
        "source": getattr(award.source, "value", award.source),
        "earned_on": award.earned_on.isoformat(),
        "issued_at": award.issued_at.isoformat(),
        "achievement": award.achievement,
        "statement": award.statement,
        "evidence_url": award.evidence_url,
        "awarded_by": {"id": awarded_by.id, "name": " ".join(part for part in (awarded_by.first_name, awarded_by.last_name) if part) or awarded_by.username}
        if awarded_by else None,
        "learner": {"id": learner.id, "user_uuid": learner.user_uuid, "username": learner.username,
                    "name": " ".join(part for part in (learner.first_name, learner.last_name) if part) or learner.username} if learner else None,
        "issuing_org": _org(db, award.issuing_org_id),
        "status": getattr(award.status, "value", award.status),
        "revoked_at": award.revoked_at.isoformat() if award.revoked_at else None,
        "revoked_reason": award.revoked_reason if award.revoked_at else "",
        "signed": bool(award.credential and award.credential.get("proof")),
    }


def awards_of(db: Session, user_id: int, revoked: bool = False) -> list[BadgeAward]:
    """A learner's badges, newest first: the ones they hold, and with ``revoked`` the revoked ones too."""
    statement = select(BadgeAward).where(BadgeAward.user_id == user_id)
    if not revoked:
        statement = statement.where(BadgeAward.status == AwardStatus.ACTIVE.value)
    return list(db.exec(statement.order_by(col(BadgeAward.earned_on).desc(), col(BadgeAward.id).desc())).all())


def revoke(db: Session, current_user, award_uuid: str, reason: str) -> BadgeAward:
    """Revoke an award: staff who review work at the organization that issued it, with a reason (recorded in the audit log)."""
    from fastapi import HTTPException

    from src.security.org_auth import require_org_admin
    from src.services.audit_logs import record_audit_log

    award = db.exec(select(BadgeAward).where(BadgeAward.award_uuid == award_uuid)).first()
    if award is None or not award.issuing_org_id:
        raise HTTPException(status_code=404, detail="Badge award not found")
    require_org_admin(current_user.id, int(award.issuing_org_id), db, "review_work")
    if not reason.strip():
        raise HTTPException(status_code=422, detail="Say why it's revoked")
    if getattr(award.status, "value", award.status) == AwardStatus.REVOKED.value:
        return award
    if award.credential is None:
        # Sign it first so it has a status list slot to revoke.
        open_badges.issue(db, award)
    award.status = AwardStatus.REVOKED
    award.revoked_at = datetime.utcnow()
    award.revoked_by_user_id = int(current_user.id)
    award.revoked_reason = reason.strip()
    award.update_date = _now()
    db.add(award)
    db.commit()
    record_audit_log(db, action="badge.revoke", resource="badge_award", status_code=200, org_id=int(award.issuing_org_id), user_id=int(current_user.id),
                     username=current_user.username, request_metadata={"award_uuid": award.award_uuid, "user_id": award.user_id, "reason": award.revoked_reason})
    db.refresh(award)
    return award


def org_badge_plans(db_session: Session, org_id: int, page: int, limit: int) -> dict:
    """An organization's plans that earn a badge (live or draft), with how many times each was awarded."""
    plans = []
    for template in db_session.exec(select(GoalTemplate).where(GoalTemplate.org_id == org_id).order_by(GoalTemplate.creation_date.desc())).all():  # type: ignore[union-attr]
        live = db_session.get(GoalTemplateVersion, template.published_version_id) if template.published_version_id else None
        badge = summary(template, live.document) if live else None
        draft = summary(template, template.document)
        if badge is None and draft is None:
            continue
        plans.append((template, badge or draft, live is not None and badge is not None))
    shown = plans[(page - 1) * limit:page * limit]
    awarded = dict(db_session.exec(select(BadgeAward.template_id, func.count()).where(
        BadgeAward.template_id.in_([int(template.id) for template, _, _ in shown] or [0])).group_by(BadgeAward.template_id)).all())  # type: ignore[union-attr]
    return {
        "items": [{"template_uuid": template.template_uuid, "title": template.title, "badge": badge, "live": live,
                   "award_count": int(awarded.get(template.id, 0)), "creation_date": template.creation_date} for template, badge, live in shown],
        "total": len(plans),
        "page": page,
        "limit": limit,
    }


def award_card(db_session: Session, award: BadgeAward) -> dict:
    """An award as the portfolio shows it: the badge as it was earned, and who awarded it."""
    earned = award.achievement or {}
    issuer = db_session.get(Organization, award.issuing_org_id) if award.issuing_org_id else None
    return {
        "award_uuid": award.award_uuid,
        "template_uuid": earned.get("template_uuid"),
        "name": earned.get("name") or "",
        "description": earned.get("description") or "",
        "image_url": earned.get("image_url") or "",
        "icon": earned.get("icon"),
        "color": earned.get("color"),
        "kind": earned.get("kind") or "Badge",
        "skills": earned.get("skills") or [],
        "earned_on": award.earned_on.isoformat(),
        "issuer": {"name": issuer.name, "slug": issuer.slug} if issuer else None,
    }


def badges_in_progress(db_session: Session, user_id: int) -> list[dict]:
    """The learner's open plans whose release earns a badge they don't hold yet, with progress."""
    earned = {item.template_id for item in awards_of(db_session, user_id)}
    goals = db_session.exec(select(Goal).where(Goal.subject_user_id == user_id, Goal.status.in_([GoalStatus.PENDING, GoalStatus.ACTIVE]))  # type: ignore[attr-defined]
                            .order_by(Goal.id)).all()  # type: ignore[arg-type]
    result = []
    for goal in goals:
        badge = goal_badge(db_session, goal) if goal.template_id not in earned else None
        if badge is None:
            continue
        statuses = db_session.exec(select(StepProgress.status).join(GoalStep, GoalStep.id == StepProgress.step_id).where(GoalStep.goal_id == goal.id)).all()
        total = len(db_session.exec(select(GoalStep.id).where(GoalStep.goal_id == goal.id)).all())
        done = sum(getattr(status, "value", status) in DONE_STEP_STATUSES for status in statuses)
        result.append({**badge, "goal_uuid": goal.goal_uuid, "plan_title": goal.title, "done": done, "total": total})
    return result
