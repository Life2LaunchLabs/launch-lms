"""Awarding a plan's badge directly, for equivalent work done outside the plan.

Org admins and staff who review work may award the badge of a released plan their
organization owns or is approved to run. One call takes the plan and any mix of
learners and groups; groups bring their active learners (alumni are left out).
Learners who already hold the badge are skipped. The person awarding signs off:
what the learners did (required, it goes on the credential), an optional evidence
link and the date it was earned, and confirms the work equals the whole plan.
Each learner gets a message in their feed, and the audit log records the award.
"""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlmodel import Session, col, select

from src.db.badges import AwardSource, BadgeAward
from src.db.goals import GoalTemplate, GoalTemplateVersion
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import require_org_admin
from src.services.badges import open_badges
from src.services.badges.awards import award_dict, holders, new_award
from src.services.badges.definition import achievement, badge_block, summary
from src.services.goals.plan_issuers import approved_on, runnable_ids

PERMISSION = "review_work"


class DirectAward(BaseModel):
    template_uuid: str
    user_ids: list[int] = Field(default_factory=list)
    group_ids: list[int] = Field(default_factory=list)
    statement: str
    evidence_url: str = ""
    earned_on: date | None = None
    # A line for one learner, added after the statement on their badge only.
    notes: dict[int, str] = Field(default_factory=dict)
    confirmed: bool = False


def _name(user: User) -> str:
    return " ".join(part for part in (user.first_name, user.last_name) if part) or user.username


def _live(db: Session, template: GoalTemplate) -> GoalTemplateVersion | None:
    return db.get(GoalTemplateVersion, template.published_version_id) if template.published_version_id else None


def awardable(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    """The released plans with a badge this organization may award: its own and the ones it is approved to run."""
    require_org_admin(current_user.id, org_id, db, PERMISSION)
    ids = set(runnable_ids(db, org_id)) | {int(item) for item in db.exec(select(GoalTemplate.id).where(GoalTemplate.org_id == org_id)).all()}
    rows = db.exec(select(GoalTemplate).where(col(GoalTemplate.id).in_(ids or {0})).order_by(col(GoalTemplate.title))).all()
    result = []
    for template in rows:
        version = _live(db, template)
        badge = summary(template, version.document) if version else None
        if badge is None:
            continue
        owner = db.get(Organization, template.org_id)
        steps = sum(len(stage.get("steps") or []) for stage in (version.document or {}).get("stages") or [])  # type: ignore[union-attr]
        result.append({**badge, "style": (badge_block(version.document) or {}).get("style") or "modern", "description": template.description or "", "title": template.title, "thumbnail_image": template.thumbnail_image, "steps": steps,
                       "owned": int(template.org_id) == int(org_id), "owner": {"name": owner.name, "slug": owner.slug} if owner else None})
    return result


def _learners(db: Session, org_id: int, user_ids: list[int], group_ids: list[int]) -> list[int]:
    """The people picked (members of the organization) and the active learners of the groups picked, in order, once each."""
    picked = list(dict.fromkeys(int(user_id) for user_id in user_ids))
    members = set(db.exec(select(UserOrganization.user_id).where(UserOrganization.org_id == org_id, col(UserOrganization.user_id).in_(picked or [0]))).all())
    if missing := [user_id for user_id in picked if user_id not in members]:
        raise HTTPException(status_code=404, detail=f"User {missing[0]} is not connected to this organization")
    for group_id in dict.fromkeys(group_ids):
        if db.exec(select(UserGroup.id).where(UserGroup.id == group_id, UserGroup.org_id == org_id)).first() is None:
            raise HTTPException(status_code=404, detail="Group not found")
        picked += [int(user_id) for user_id in db.exec(select(UserGroupUser.user_id).join(UserOrganization, and_(
            UserOrganization.user_id == UserGroupUser.user_id, UserOrganization.org_id == org_id,
        )).where(UserGroupUser.usergroup_id == group_id, UserOrganization.role_id == 4, or_(
            col(UserOrganization.status).is_(None), UserOrganization.status != "alumni",
        )).order_by(col(UserGroupUser.id))).all()]
    return list(dict.fromkeys(picked))


def _plan(db: Session, org_id: int, template_uuid: str) -> tuple[GoalTemplate, GoalTemplateVersion, dict]:
    """A released plan with a badge this organization may award."""
    template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template_uuid)).first()
    if template is None or not approved_on(db, template.id, org_id):
        raise HTTPException(status_code=404, detail="Plan not found")
    version = _live(db, template)
    earned = achievement(db, template, version.document or {}, version.semver) if version else None
    if version is None or earned is None:
        raise HTTPException(status_code=422, detail="Only a released plan with a badge can be awarded")
    return template, version, earned


def _person(user: User) -> dict:
    return {"user_id": int(user.id), "name": _name(user), "username": user.username, "avatar_image": user.avatar_image, "user_uuid": user.user_uuid}  # type: ignore[arg-type]


def holder_ids(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> list[int]:
    """The organization's members who already hold this plan's badge."""
    require_org_admin(current_user.id, org_id, db, PERMISSION)
    template, _, _ = _plan(db, org_id, template_uuid)
    members = select(UserOrganization.user_id).where(UserOrganization.org_id == org_id)
    return [int(user_id) for user_id in db.exec(select(BadgeAward.user_id).where(BadgeAward.template_id == template.id, col(BadgeAward.user_id).in_(members))).all()]


def preview(db: Session, current_user: PublicUser, org_id: int, payload: DirectAward) -> dict:
    """Who an award would reach (groups expanded to their active learners) and who it would skip, without awarding."""
    require_org_admin(current_user.id, org_id, db, PERMISSION)
    template, _, _ = _plan(db, org_id, payload.template_uuid)
    learners = _learners(db, org_id, payload.user_ids, payload.group_ids)
    held = holders(db, int(template.id), learners)  # type: ignore[arg-type]
    users = {int(user.id): user for user in db.exec(select(User).where(col(User.id).in_(learners or [0]))).all()}  # type: ignore[arg-type]
    return {"learners": [_person(users[user_id]) for user_id in learners if user_id not in held and user_id in users],
            "skipped": [{**_person(users[user_id]), "reason": "already_has_badge"} for user_id in learners if user_id in held and user_id in users]}


def award_directly(db: Session, current_user: PublicUser, org_id: int, payload: DirectAward) -> dict:
    from src.services.audit_logs import record_audit_log
    from src.services.goals.completion import on_badge_awarded
    from src.services.messages import create_inbox_message

    require_org_admin(current_user.id, org_id, db, PERMISSION)
    statement = payload.statement.strip()
    if not statement:
        raise HTTPException(status_code=422, detail="Say what the learners did; it goes on their badge")
    if not payload.confirmed:
        raise HTTPException(status_code=422, detail="Confirm the work equals the whole plan")
    if payload.earned_on and payload.earned_on > date.today():
        raise HTTPException(status_code=422, detail="The date earned can't be in the future")
    template, version, earned = _plan(db, org_id, payload.template_uuid)
    learners = _learners(db, org_id, payload.user_ids, payload.group_ids)
    if not learners:
        raise HTTPException(status_code=422, detail="Pick at least one learner")
    held = holders(db, int(template.id), learners)  # type: ignore[arg-type]
    org = db.get(Organization, org_id)
    users = {int(user.id): user for user in db.exec(select(User).where(col(User.id).in_(learners))).all()}  # type: ignore[arg-type]
    made: list[BadgeAward] = []
    for user_id in learners:
        if user_id in held:
            continue
        note = (payload.notes.get(user_id) or "").strip()
        award = new_award(template, version, earned, user_id, org_id, AwardSource.DIRECT_AWARD, awarded_by_user_id=int(current_user.id),
                          statement=f"{statement}\n\n{note}" if note else statement, evidence_url=payload.evidence_url.strip(), earned_on=payload.earned_on)
        db.add(award)
        made.append(award)
    db.flush()
    for award in made:
        open_badges.issue(db, award)
    for award in made:
        create_inbox_message(
            db, recipient_user_id=award.user_id, sender_org_id=org_id, sender_user_id=int(current_user.id), message_type="badge_award",
            subject=f"You earned {earned['name']}", body=f"{org.name if org else 'Your organization'} awarded you the {earned['name']} badge for work equal to {template.title}.",
            action_url=f"/b/{award.code}", dedupe_key=f"badge_award:{award.award_uuid}",
        )
    db.commit()
    for award in made:
        # Plans with a step to earn this badge count it done.
        on_badge_awarded(db, int(award.user_id), int(template.id))  # type: ignore[arg-type]
    if made:
        record_audit_log(db, action="badge.award_direct", resource="badge_award", status_code=200, org_id=org_id, user_id=int(current_user.id),
                         username=current_user.username, request_metadata={"template_uuid": template.template_uuid, "user_ids": [award.user_id for award in made],
                                                                           "award_uuids": [award.award_uuid for award in made]})
    return {
        "awarded": [award_dict(db, award) for award in made],
        "skipped": [{**_person(users[user_id]), "reason": "already_has_badge"} for user_id in learners if user_id in held and user_id in users],
    }


def learner_awards(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    """A learner's badges, for staff of an organization the learner belongs to, and whether this person may award one."""
    from src.security.org_auth import is_org_admin
    from src.services.badges.awards import awards_of

    require_org_admin(current_user.id, org_id, db)
    if db.exec(select(UserOrganization.id).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first() is None:
        raise HTTPException(status_code=404, detail="User is not connected to this organization")
    return {"awards": [award_dict(db, award) for award in awards_of(db, user_id, revoked=True)], "can_award": is_org_admin(current_user.id, org_id, db, PERMISSION)}
