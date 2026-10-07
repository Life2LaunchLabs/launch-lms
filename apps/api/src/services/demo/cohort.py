"""Draft cohort designation and published pilot identities; no public live lookup."""

from fastapi import HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select, delete
from src.db.demo import DemoMember
from src.db.users import User
from src.db.user_organizations import UserOrganization
from src.services.demo.configuration import configuration


class MemberInput(BaseModel):
    user_email: EmailStr
    pilotable: bool = False
    description: str = Field(default="", max_length=1000)


class CohortSettings(BaseModel):
    revision: int = Field(ge=1)
    members: list[MemberInput] = Field(max_length=1000)


def members(db: Session) -> list[DemoMember]:
    return list(db.exec(select(DemoMember).order_by(DemoMember.user_id)).all())


def validate_member(db: Session, user: User | None, org_id: int | None) -> User:
    from src.security.superadmin import is_user_owner_org_admin

    if not user or user.is_superadmin or is_user_owner_org_admin(user.id, db):
        raise HTTPException(
            422, "Demo accounts must not have platform administrator privileges."
        )
    membership = db.exec(
        select(UserOrganization).where(
            UserOrganization.user_id == user.id, UserOrganization.org_id == org_id
        )
    ).first()
    if not membership:
        raise HTTPException(
            422,
            "Every demo account must belong to the fictional scenario organization.",
        )
    return user


def save_cohort(db: Session, body: CohortSettings) -> dict:
    config = configuration(db, lock=True)
    if config.revision != body.revision:
        raise HTTPException(409, "Demo setup changed. Reload before saving.")
    if not config.entry_org_id:
        raise HTTPException(
            422, "Choose the fictional scenario organization in Settings first."
        )
    resolved = []
    for item in body.members:
        user = validate_member(
            db,
            db.exec(select(User).where(User.email == item.user_email)).first(),
            config.entry_org_id,
        )
        if any(member.user_id == user.id for member in resolved):
            raise HTTPException(422, "Each demo account can appear only once.")
        resolved.append(
            DemoMember(
                user_id=user.id,
                pilotable=item.pilotable,
                description=item.description.strip(),
            )
        )
    db.exec(delete(DemoMember))
    for item in resolved:
        db.add(item)
    config.source_user_id = resolved[0].user_id if resolved else None
    config.revision += 1
    db.add(config)
    # Draft changes do not alter published pilots or already prepared workspaces.
    db.commit()
    return {"revision": config.revision}


def draft_accounts(db: Session) -> list[dict]:
    result = []
    for member in members(db):
        user = db.get(User, member.user_id)
        if user:
            result.append(
                {
                    **identity(user),
                    "user_email": user.email,
                    "pilotable": member.pilotable,
                    "description": member.description,
                }
            )
    return result


def identity(user: User) -> dict:
    return {
        "user_id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "username": user.username,
    }


def public_pilots(checkpoint) -> list[dict]:
    if not checkpoint:
        return []
    return [
        {key: value for key, value in account.items() if key != "email"}
        for account in checkpoint.pilots.values()
    ]


def pilot(checkpoint, identifier: int | None) -> dict:
    if not checkpoint:
        raise HTTPException(503, "The demo checkpoint is unavailable.")
    # Old internal fixtures can still exercise the original single-user contract;
    # migration disables old published checkpoints before public admission.
    if not checkpoint.pilots and identifier in (None, checkpoint.source_user_id):
        return {"user_id": checkpoint.source_user_id, "email": checkpoint.source_email}
    account = checkpoint.pilots.get(str(identifier))
    if not account:
        raise HTTPException(
            422, "Choose an available demo account from the selection page."
        )
    return account
