"""A goal's activity log, comments and attachments (ported from ``services/planning.py``)."""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalOwnership
from src.db.media import MediaAsset, MediaOwnerType
from src.db.goal_sharing import PlanActivity, PlanAttachment, PlanAttachmentCreate, PlanCommentCreate
from src.db.users import PublicUser
from src.services.goals import access
from src.services.goals.sharing_roles import _stamp, _value, user_summary

CONTRIBUTE = {"contribute_fields", "contribute_restricted_fields", "edit_plan_details"}


def _activity_dict(db: Session, item: PlanActivity) -> dict:
    return {"activity_uuid": item.activity_uuid, "action": item.action, "actor": user_summary(db, item.actor_user_id), "payload": item.payload or {}, "creation_date": item.creation_date}


def list_activity(db: Session, current_user: PublicUser, goal_uuid: str) -> list[dict]:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "view_plan")
    rows = db.exec(select(PlanActivity).where(PlanActivity.goal_id == goal.id).order_by(PlanActivity.id.desc())).all()  # type: ignore[union-attr]
    return [_activity_dict(db, item) for item in rows]


def add_comment(db: Session, current_user: PublicUser, goal_uuid: str, payload: PlanCommentCreate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "comment")
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="Comment is required")
    access.log(db, goal, current_user.id, "comment.added", {"body": body})
    db.commit()
    return list_activity(db, current_user, goal_uuid)[0]


def _attachment_dict(asset: MediaAsset, attachment: PlanAttachment) -> dict:
    return {
        "asset_uuid": asset.asset_uuid, "title": asset.title, "url": asset.url, "thumbnail_url": asset.thumbnail_url,
        "filename": asset.filename, "mime_type": asset.mime_type, "size_bytes": asset.size_bytes,
        "added_by_user_id": attachment.added_by_user_id, "creation_date": attachment.creation_date,
    }


def list_attachments(db: Session, current_user: PublicUser, goal_uuid: str) -> list[dict]:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "view_plan")
    rows = db.exec(select(PlanAttachment, MediaAsset).join(MediaAsset, MediaAsset.id == PlanAttachment.asset_id).where(PlanAttachment.goal_id == goal.id).order_by(PlanAttachment.id.desc())).all()  # type: ignore[arg-type, union-attr]
    return [_attachment_dict(asset, attachment) for attachment, asset in rows]


def _owned_by_goal(asset: MediaAsset, goal: Goal) -> bool:
    """Personal goals use their owner's (or learner's) media; issued goals use their organization's."""
    if _value(goal.ownership) == GoalOwnership.PERSONAL.value:
        return _value(asset.owner_type) == MediaOwnerType.user.value and asset.owner_user_id in {goal.owner_user_id, goal.subject_user_id}
    return bool(goal.org_id) and _value(asset.owner_type) == MediaOwnerType.org.value and asset.owner_org_id == goal.org_id


def add_attachment(db: Session, current_user: PublicUser, goal_uuid: str, payload: PlanAttachmentCreate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.capabilities(db, goal, current_user.id)
    if not CONTRIBUTE & granted:
        raise HTTPException(status_code=404 if not granted else 403, detail="Goal not found" if not granted else "You cannot add goal attachments")
    asset = db.exec(select(MediaAsset).where(MediaAsset.asset_uuid == payload.asset_uuid)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    if not _owned_by_goal(asset, goal):
        raise HTTPException(status_code=403, detail="Use media owned by this goal's organization or owner")
    mime_type = (asset.mime_type or "").lower()
    if not (mime_type.startswith(("image/", "video/")) or mime_type == "application/pdf"):
        raise HTTPException(status_code=422, detail="Goal attachments must be an image, video, or PDF")
    existing = db.exec(select(PlanAttachment).where(PlanAttachment.goal_id == goal.id, PlanAttachment.asset_id == asset.id)).first()
    if existing:
        return _attachment_dict(asset, existing)
    attachment = PlanAttachment(goal_id=goal.id, asset_id=int(asset.id), added_by_user_id=current_user.id, creation_date=_stamp())  # type: ignore[arg-type]
    db.add(attachment)
    db.flush()
    access.log(db, goal, current_user.id, "attachment.added", {"asset_uuid": asset.asset_uuid})
    db.commit()
    return _attachment_dict(asset, attachment)


def remove_attachment(db: Session, current_user: PublicUser, goal_uuid: str, asset_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.require(db, goal, current_user.id, "view_plan")
    row = db.exec(select(PlanAttachment, MediaAsset).join(MediaAsset, MediaAsset.id == PlanAttachment.asset_id).where(PlanAttachment.goal_id == goal.id, MediaAsset.asset_uuid == asset_uuid)).first()  # type: ignore[arg-type]
    if not row:
        raise HTTPException(status_code=404, detail="Goal attachment not found")
    attachment = row[0]
    if attachment.added_by_user_id != current_user.id and not ({"edit_plan_details", "manage_collaborators"} & granted):
        raise HTTPException(status_code=403, detail="You cannot remove this attachment")
    db.delete(attachment)
    access.log(db, goal, current_user.id, "attachment.removed", {"asset_uuid": asset_uuid})
    db.commit()
    return {"removed": True, "asset_uuid": asset_uuid}
