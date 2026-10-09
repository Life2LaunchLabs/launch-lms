"""Demo users: ordinary fake accounts, presented live, captured together on publish."""

import re

from fastapi import HTTPException
from sqlmodel import Session, select
from src.db.demo import DemoMember
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services.demo.guide import try_titles, user_pages

HANDLE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
# Top-level paths on the demo host that a handle must never shadow.
RESERVED_HANDLES = frozenset(
    "admin api auth demo hub login logout orgs portfolio plans badges signup settings account".split()
)


def members(db: Session) -> list[DemoMember]:
    return list(
        db.exec(
            select(DemoMember).order_by(DemoMember.position, DemoMember.user_id)
        ).all()
    )


def default_org(db: Session) -> Organization:
    """The main portal org; matches the instance router's default org."""
    org = db.exec(select(Organization).order_by(Organization.id).limit(1)).first()
    if not org:
        raise HTTPException(503, "No organization exists yet.")
    return org


def validate_member(db: Session, user: User | None) -> User:
    from src.security.superadmin import is_user_owner_org_admin

    if not user or user.is_superadmin or is_user_owner_org_admin(user.id, db):
        raise HTTPException(
            422, "Demo accounts must not have platform administrator privileges."
        )
    return user


def org_slugs(db: Session, user_id: int) -> list[dict]:
    rows = db.exec(
        select(Organization.slug, Organization.name, UserOrganization.role_id)
        .join(UserOrganization, UserOrganization.org_id == Organization.id)
        .where(UserOrganization.user_id == user_id)
        .order_by(Organization.id)
    ).all()
    return [{"slug": slug, "name": name, "role_id": role} for slug, name, role in rows]


def identity(user: User) -> dict:
    return {
        "user_id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "username": user.username,
    }


def presentation(member: DemoMember) -> dict:
    return {
        "pilotable": member.pilotable,
        "description": member.description,
        "role_line": member.role_line,
        "handle": member.handle,
        "start_path": member.start_path,
        "start_org_slug": member.start_org_slug,
        "guide": {"pages": user_pages(member.guide)},
        "position": member.position,
    }


def draft_accounts(db: Session, published_at=None) -> list[dict]:
    result = []
    for member in members(db):
        user = db.get(User, member.user_id)
        if user:
            result.append(
                {
                    **identity(user),
                    **presentation(member),
                    "user_email": user.email,
                    "avatar_image": user.avatar_image or "",
                    "user_uuid": user.user_uuid,
                    "orgs": org_slugs(db, user.id),
                    "last_setup_at": member.last_setup_at.isoformat() + "Z"
                    if member.last_setup_at
                    else None,
                    "changed": bool(
                        member.last_setup_at
                        and (
                            published_at is None or member.last_setup_at > published_at
                        )
                    ),
                }
            )
    return result


def public_pilots(db: Session, checkpoint) -> list[dict]:
    """Published identities, with live card text; only pickable users appear."""
    if not checkpoint:
        return []
    live = {member.user_id: member for member in members(db)}
    result = []
    for account in checkpoint.pilots.values():
        member = live.get(account["user_id"])
        if not member or not member.pilotable:
            continue
        result.append(
            {
                **{key: value for key, value in account.items() if key != "email"},
                "description": member.description,
                "role_line": member.role_line,
                "handle": member.handle,
                "position": member.position,
                "journeys": try_titles(member.guide),
            }
        )
    return sorted(result, key=lambda item: (item["position"], item["user_id"]))


def pilot(
    db: Session, checkpoint, identifier: int | None, *, pickable: bool = True
) -> dict:
    """A published demo user. New visits also require it to be on the picker."""
    if not checkpoint:
        raise HTTPException(503, "The demo checkpoint is unavailable.")
    account = checkpoint.pilots.get(str(identifier))
    member = db.get(DemoMember, identifier) if identifier else None
    if not account or (pickable and (not member or not member.pilotable)):
        raise HTTPException(
            422, "Choose an available demo user from the selection page."
        )
    return {
        **account,
        "start_path": member.start_path if member else "",
        "start_org_slug": member.start_org_slug if member else "",
    }


def resolve_handle(db: Session, handle: str) -> DemoMember | None:
    return db.exec(
        select(DemoMember).where(DemoMember.handle == handle.lower())
    ).first()


def unique_handle(db: Session, base: str, exclude: int | None = None) -> str:
    stem = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")[:30] or "demo"
    candidate, suffix = stem, 1
    while candidate in RESERVED_HANDLES or (
        (existing := resolve_handle(db, candidate)) and existing.user_id != exclude
    ):
        suffix += 1
        candidate = f"{stem}-{suffix}"
    return candidate
