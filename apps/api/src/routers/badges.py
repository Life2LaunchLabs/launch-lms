"""Badge awards: a learner's own, one award (public), its Open Badges JSON, and awarding directly."""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.badges import BadgeAward
from src.db.goals import GoalTemplate
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.badges import awards, definition, direct, open_badges

router = APIRouter()


def _award(db: Session, award_uuid: str) -> BadgeAward:
    award = db.exec(select(BadgeAward).where(BadgeAward.award_uuid == award_uuid)).first()
    if award is None:
        raise HTTPException(status_code=404, detail="Badge award not found")
    return award


@router.get("/")
def api_my_awards(db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> list[dict]:
    """The signed-in learner's badges, newest first."""
    return [awards.award_dict(db, award) for award in awards.awards_of(db, int(current_user.id))]


@router.get("/awardable")
def api_awardable(org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> list[dict]:
    """The released plans with a badge this organization may award directly."""
    return direct.awardable(db, current_user, org_id)


@router.get("/holders")
def api_holders(org_id: int, template_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> list[int]:
    """The organization's members who already hold a plan's badge."""
    return direct.holder_ids(db, current_user, org_id, template_uuid)


@router.post("/direct/preview")
def api_award_preview(org_id: int, payload: direct.DirectAward, db: Session = Depends(get_db_session),
                      current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Who a direct award would reach and who it would skip, without awarding."""
    return direct.preview(db, current_user, org_id, payload)


@router.post("/direct")
def api_award_directly(org_id: int, payload: direct.DirectAward, db: Session = Depends(get_db_session),
                       current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Award a plan's badge to learners and groups for equivalent work, with the awarder's sign-off."""
    return direct.award_directly(db, current_user, org_id, payload)


@router.get("/learner/{user_id}")
def api_learner_awards(user_id: int, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """A learner's badges, for staff."""
    return direct.learner_awards(db, current_user, org_id, user_id)


@router.get("/issuer/{org_uuid}")
def api_issuer_profile(org_uuid: str, db: Session = Depends(get_db_session)) -> dict:
    """An organization as an Open Badges Profile."""
    org = db.exec(select(Organization).where(Organization.org_uuid == org_uuid)).first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return open_badges.profile(org)


@router.get("/achievement/{template_uuid}")
def api_achievement(template_uuid: str, db: Session = Depends(get_db_session)) -> dict:
    """The Open Badges Achievement a plan's live release earns."""
    template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template_uuid)).first()
    earned = definition.live_achievement(db, template) if template else None
    if earned is None:
        raise HTTPException(status_code=404, detail="This plan doesn't earn a badge")
    return open_badges.achievement(db, earned)


@router.get("/{award_uuid}")
def api_award(award_uuid: str, db: Session = Depends(get_db_session)) -> dict:
    """One award, as its public page shows it."""
    return awards.award_dict(db, _award(db, award_uuid))


@router.get("/{award_uuid}/credential")
def api_award_credential(award_uuid: str, db: Session = Depends(get_db_session)) -> dict:
    """The award as an Open Badges 3.0 OpenBadgeCredential."""
    return open_badges.credential(db, _award(db, award_uuid))
