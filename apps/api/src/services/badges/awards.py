"""Badges learners earn, kept in their portfolio.

A learner earns a plan's badge by finishing the plan with an organization that
runs it (the plan's owner, or one approved to run it), on a release that has a
badge. Each award keeps the achievement as it was earned. A learner holds a
plan's badge once: finishing the plan again, or later finishing a plan whose
badge they were awarded directly, makes no second award.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import uuid4

from sqlmodel import Session, col, select

from src.db.badges import AwardSource, BadgeAward
from src.db.goals import Goal, GoalTemplate, GoalTemplateVersion
from src.db.organizations import Organization
from src.db.users import User
from src.services.badges.definition import achievement


def _now() -> str:
    return datetime.now().isoformat()


def held(db: Session, template_id: int | None, user_id: int | None) -> BadgeAward | None:
    if not template_id or not user_id:
        return None
    return db.exec(select(BadgeAward).where(BadgeAward.template_id == template_id, BadgeAward.user_id == user_id)).first()


def holders(db: Session, template_id: int, user_ids: list[int]) -> dict[int, BadgeAward]:
    """User id -> their award of this plan's badge, for the users given."""
    if not user_ids:
        return {}
    rows = db.exec(select(BadgeAward).where(BadgeAward.template_id == template_id, col(BadgeAward.user_id).in_(user_ids))).all()
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
    }


def awards_of(db: Session, user_id: int) -> list[BadgeAward]:
    return list(db.exec(select(BadgeAward).where(BadgeAward.user_id == user_id).order_by(col(BadgeAward.earned_on).desc(), col(BadgeAward.id).desc())).all())
