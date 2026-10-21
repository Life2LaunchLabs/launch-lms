"""The portfolio is the profile: who a learner adds to it, what each person can do, and their comments.

A learner adds people by @handle as a Viewer, who can see the portfolio even while it's private,
or as a Commenter, who can also comment on it and on its projects and experiences. Items the
learner marked private stay hidden from everyone but them.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.portfolio import Portfolio, PortfolioModerationStatus, PortfolioVisibility, ProjectItem, TimelineEntry
from src.db.portfolio_people import PortfolioComment, PortfolioCommentCreate, PortfolioPerson, PortfolioPersonCreate
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services import portfolio as portfolio_service
from src.services.connect import cards, people as connect_people
from src.services.goals.sharing_roles import _stamp

ROLES = {
    "viewer": {"name": "Viewer", "hint": "Can see your portfolio, even while it's private"},
    "commenter": {"name": "Commenter", "hint": "Can see it and comment on it"},
}
ITEM_KINDS = ("portfolio", "project", "timeline")


def choices() -> list[dict]:
    return [{"key": key, **value} for key, value in ROLES.items()]


def _role(role: str) -> str:
    if role not in ROLES:
        raise HTTPException(status_code=422, detail="Choose Viewer or Commenter")
    return role


def _target(db: Session, handle: str) -> User:
    raw = (handle or "").strip()
    if "@" in raw.lstrip("@"):
        user = db.exec(select(User).where(col(User.email).ilike(raw))).first()
    else:
        name = raw.lstrip("@")
        user = db.exec(select(User).where(col(User.username).ilike(name))).first()
        user = user if user and user.username.lower() == name.lower() else None
    if not user:
        raise HTTPException(status_code=404, detail=f"No one goes by {raw}")
    return user


def _own(db: Session, current_user: PublicUser) -> Portfolio:
    return portfolio_service.get_or_create_portfolio(current_user, db)


def _person_dict(db: Session, row: PortfolioPerson) -> dict:
    return {"user": connect_people.person(db, row.user_id), "role": row.role, "role_name": ROLES.get(row.role, {}).get("name", row.role), "creation_date": row.creation_date}


def list_people(db: Session, current_user: PublicUser) -> dict:
    portfolio = _own(db, current_user)
    rows = db.exec(select(PortfolioPerson).where(PortfolioPerson.portfolio_id == portfolio.id).order_by(col(PortfolioPerson.id))).all()
    return {"people": [_person_dict(db, row) for row in rows], "choices": choices(), "visibility": portfolio_service._enum_value(portfolio.visibility)}


def add_person(db: Session, current_user: PublicUser, payload: PortfolioPersonCreate) -> dict:
    portfolio = _own(db, current_user)
    role = _role(payload.role)
    target = _target(db, payload.handle)
    if target.id == current_user.id:
        raise HTTPException(status_code=422, detail="That's you")
    if connect_people.blocked(db, current_user.id, int(target.id)):  # type: ignore[arg-type]
        raise HTTPException(status_code=404, detail=f"No one goes by {payload.handle.strip()}")
    row = db.exec(select(PortfolioPerson).where(PortfolioPerson.portfolio_id == portfolio.id, PortfolioPerson.user_id == target.id)).first()
    now = _stamp()
    if row:
        row.role, row.update_date = role, now
    else:
        row = PortfolioPerson(portfolio_id=int(portfolio.id), user_id=int(target.id), role=role, added_by_user_id=current_user.id, creation_date=now, update_date=now)  # type: ignore[arg-type]
        db.add(row)
        db.flush()
        cards.portfolio_shared(db, current_user.id, current_user.username, int(target.id), role)  # type: ignore[arg-type]
    db.add(row)
    db.commit()
    return list_people(db, current_user)


def _row(db: Session, portfolio: Portfolio, user_uuid: str) -> PortfolioPerson:
    user = db.exec(select(User).where(User.user_uuid == user_uuid)).first()
    row = db.exec(select(PortfolioPerson).where(PortfolioPerson.portfolio_id == portfolio.id, PortfolioPerson.user_id == user.id)).first() if user else None
    if not row:
        raise HTTPException(status_code=404, detail="They aren't on your portfolio")
    return row


def update_person(db: Session, current_user: PublicUser, user_uuid: str, role: str) -> dict:
    row = _row(db, _own(db, current_user), user_uuid)
    row.role, row.update_date = _role(role), _stamp()
    db.add(row)
    db.commit()
    return list_people(db, current_user)


def remove_person(db: Session, current_user: PublicUser, user_uuid: str) -> dict:
    db.delete(_row(db, _own(db, current_user), user_uuid))
    db.commit()
    return list_people(db, current_user)


def _portfolio_for(db: Session, org_id: int, username: str) -> tuple[User, Portfolio]:
    user = db.exec(select(User).where(User.username == username)).first()
    member = user and db.exec(select(UserOrganization).where(UserOrganization.user_id == user.id, UserOrganization.org_id == org_id)).first()
    portfolio = portfolio_service._get_portfolio(db, int(user.id)) if member else None  # type: ignore[union-attr, arg-type]
    if not user or not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return user, portfolio


def role_for(db: Session, portfolio: Portfolio, viewer_id: int) -> str | None:
    if portfolio.user_id == viewer_id:
        return "owner"
    row = db.exec(select(PortfolioPerson.role).where(PortfolioPerson.portfolio_id == portfolio.id, PortfolioPerson.user_id == viewer_id)).first()
    return row if row and not connect_people.blocked(db, portfolio.user_id, viewer_id) else None


def _require(db: Session, portfolio: Portfolio, viewer_id: int, comment: bool = False) -> str:
    role = role_for(db, portfolio, viewer_id)
    if not role or portfolio_service._enum_value(portfolio.moderation_status) != PortfolioModerationStatus.CLEAR.value:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if comment and role not in ("owner", "commenter"):
        raise HTTPException(status_code=403, detail="Only Commenters can comment on this portfolio")
    return role


def shared_shell(db: Session, current_user: PublicUser, org_id: int, username: str) -> dict:
    """The portfolio as this person may see it: as one of its people even while private, or as anyone once published."""
    _, portfolio = _portfolio_for(db, org_id, username)
    role = role_for(db, portfolio, current_user.id)
    if role and portfolio_service._enum_value(portfolio.moderation_status) == PortfolioModerationStatus.CLEAR.value:
        shell = portfolio_service.portfolio_shell(portfolio, db, public_only=True)
    else:
        shell = portfolio_service.get_public_shell(org_id, username, db)
    private = portfolio_service._enum_value(portfolio.visibility) == PortfolioVisibility.PRIVATE.value or not portfolio.published_at
    return {**shell, "access": {"role": role or "public", "can_comment": role in ("owner", "commenter"), "shared_privately": bool(role) and private}}


def _item_title(db: Session, portfolio: Portfolio, kind: str, item_uuid: str | None) -> str:
    if kind == "portfolio":
        return "your portfolio"
    model, key = (ProjectItem, ProjectItem.project_uuid) if kind == "project" else (TimelineEntry, TimelineEntry.timeline_uuid)
    item = db.exec(select(model).where(model.portfolio_id == portfolio.id, key == item_uuid)).first() if item_uuid else None  # type: ignore[attr-defined]
    if not item or portfolio_service._enum_value(item.visibility) == PortfolioVisibility.PRIVATE.value:
        raise HTTPException(status_code=404, detail="That item isn't on this portfolio")
    return item.title


def _comment_dict(db: Session, row: PortfolioComment, viewer_id: int, owner: bool) -> dict:
    return {
        "comment_uuid": row.comment_uuid, "item_kind": row.item_kind, "item_uuid": row.item_uuid, "body": row.body,
        "author": connect_people.person(db, row.author_user_id), "creation_date": row.creation_date,
        "can_delete": row.author_user_id == viewer_id or owner,
    }


def list_comments(db: Session, current_user: PublicUser, org_id: int, username: str) -> dict:
    _, portfolio = _portfolio_for(db, org_id, username)
    role = _require(db, portfolio, current_user.id)
    owner = role == "owner"
    rows = db.exec(select(PortfolioComment).where(PortfolioComment.portfolio_id == portfolio.id).order_by(col(PortfolioComment.id))).all()
    replies: dict[int, list[dict]] = {}
    for row in rows:
        if row.parent_id:
            replies.setdefault(int(row.parent_id), []).append(_comment_dict(db, row, current_user.id, owner))
    threads = [{**_comment_dict(db, row, current_user.id, owner), "replies": replies.get(int(row.id), [])} for row in rows if not row.parent_id]  # type: ignore[arg-type]
    return {"role": role, "can_comment": role in ("owner", "commenter"), "threads": threads}


def add_comment(db: Session, current_user: PublicUser, org_id: int, username: str, payload: PortfolioCommentCreate) -> dict:
    owner_user, portfolio = _portfolio_for(db, org_id, username)
    _require(db, portfolio, current_user.id, comment=True)
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=422, detail="Write a comment first")
    parent = db.exec(select(PortfolioComment).where(PortfolioComment.portfolio_id == portfolio.id, PortfolioComment.comment_uuid == payload.parent_uuid)).first() if payload.parent_uuid else None
    if payload.parent_uuid and (not parent or parent.parent_id):
        raise HTTPException(status_code=404 if not parent else 422, detail="Reply to the thread's first comment")
    kind = parent.item_kind if parent else payload.item_kind
    item_uuid = parent.item_uuid if parent else (payload.item_uuid if kind != "portfolio" else None)
    if kind not in ITEM_KINDS:
        raise HTTPException(status_code=422, detail="Comment on the portfolio, a project or an experience")
    title = _item_title(db, portfolio, kind, item_uuid)
    now = _stamp()
    row = PortfolioComment(
        comment_uuid=f"portfolio_comment_{uuid4()}", portfolio_id=int(portfolio.id), item_kind=kind, item_uuid=item_uuid,  # type: ignore[arg-type]
        parent_id=int(parent.id) if parent else None, author_user_id=current_user.id, body=body, creation_date=now, update_date=now,  # type: ignore[arg-type]
    )
    db.add(row)
    db.flush()
    # The owner hears about new comments; on a reply, so do the thread's earlier voices.
    audience = [owner_user.id]
    if parent:
        audience += db.exec(select(PortfolioComment.author_user_id).where((PortfolioComment.id == parent.id) | (PortfolioComment.parent_id == parent.id))).all()
    for user_id in dict.fromkeys(int(item) for item in audience if item):
        if user_id != current_user.id and role_for(db, portfolio, user_id):
            cards.portfolio_comment(db, owner_user.username, title if user_id == owner_user.id or kind != "portfolio" else f"{owner_user.username}'s portfolio", row.comment_uuid, body, current_user.id, user_id)
    db.commit()
    return _comment_dict(db, row, current_user.id, portfolio.user_id == current_user.id)


def delete_comment(db: Session, current_user: PublicUser, org_id: int, username: str, comment_uuid: str) -> dict:
    _, portfolio = _portfolio_for(db, org_id, username)
    role = _require(db, portfolio, current_user.id)
    row = db.exec(select(PortfolioComment).where(PortfolioComment.portfolio_id == portfolio.id, PortfolioComment.comment_uuid == comment_uuid)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Comment not found")
    if row.author_user_id != current_user.id and role != "owner":
        raise HTTPException(status_code=403, detail="You can only delete your own comments")
    for reply in db.exec(select(PortfolioComment).where(PortfolioComment.parent_id == row.id)).all():
        db.delete(reply)
    db.delete(row)
    db.commit()
    return {"deleted": True, "comment_uuid": comment_uuid}
