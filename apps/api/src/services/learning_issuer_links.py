"""Learner/issuer link transitions shared by issuer decisions and demo simulation."""

from datetime import datetime

from sqlmodel import Session, select
from src.db.learning import BadgeIssuerLearnerLink, BadgeIssuerLearnerLinkStatus
from src.db.user_organizations import UserOrganization
from src.services.demo.context import current_demo


def ensure_learner_membership(db_session: Session, link: BadgeIssuerLearnerLink, now: str) -> None:
    """An accepted learner joins the issuing org as a member."""
    membership = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.org_id == link.issuer_org_id,
            UserOrganization.user_id == link.user_id,
        )
    ).first()
    if not membership:
        db_session.add(UserOrganization(
            user_id=link.user_id,
            org_id=link.issuer_org_id,
            role_id=4,
            creation_date=now,
            update_date=now,
        ))


def simulate_issuer_acceptance(db_session: Session, link: BadgeIssuerLearnerLink) -> BadgeIssuerLearnerLink:
    """Issuer staff never sign in to a demo copy, so a pending request is accepted at once."""
    if not current_demo.get() or link.status != BadgeIssuerLearnerLinkStatus.REQUESTED:
        return link
    link.status = BadgeIssuerLearnerLinkStatus.ACCEPTED
    link.decided_at = datetime.utcnow()
    ensure_learner_membership(db_session, link, link.update_date)
    db_session.add(link)
    db_session.commit()
    db_session.refresh(link)
    return link


def find_link(db_session: Session, badge_id: int, issuer_org_id: int, user_id: int | None) -> BadgeIssuerLearnerLink | None:
    """The learner's link with an issuer for a badge (one per badge, issuer and learner)."""
    if user_id is None:
        return None
    return db_session.exec(select(BadgeIssuerLearnerLink).where(
        BadgeIssuerLearnerLink.badge_id == badge_id,
        BadgeIssuerLearnerLink.issuer_org_id == issuer_org_id,
        BadgeIssuerLearnerLink.user_id == user_id,
    ).order_by(BadgeIssuerLearnerLink.id.desc())).first()  # type: ignore[union-attr]


def new_link(badge_id: int, issuer_org_id: int, user_id: int, now: str, **values) -> BadgeIssuerLearnerLink:
    from uuid import uuid4

    return BadgeIssuerLearnerLink(link_uuid=f"issuer_link_{uuid4()}", badge_id=badge_id, issuer_org_id=issuer_org_id, user_id=user_id,
                                  creation_date=now, update_date=now, **values)
