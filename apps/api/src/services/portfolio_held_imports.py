"""Staff send learners their Oregon CIS work: an invitation saying it's waiting, with the work held until they accept.

Learners not yet in the organization get an organization invitation (source ``cis``) whose email says their CIS
work will come over; learners already in it get an email pointing them to their portfolio's import page. Either
way the export is held privately (db/portfolio_held_imports.py) for the learner and the staff who sent it, and is
deleted when it is brought in, declined, withdrawn, or its invitation is revoked or expires (``purge``)."""

import html
import logging
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlmodel import Session, col, func, select
from starlette.concurrency import run_in_threadpool

from src.db.organization_invitations import InviteUsersRequest, OrganizationInvitation
from src.db.organizations import Organization
from src.db.portfolio_held_imports import HeldPortfolioImport
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_owner_admin, require_org_admin
from src.security.rbac.constants import USER_ROLE_ID
from src.services import portfolio_import_bulk as bulk
from src.services.email.utils import EmailDeliveryError, get_base_url_from_request, send_email
from src.services.portfolio_import_sources import cis_export, read_cis_workbook

logger = logging.getLogger(__name__)
HOLD_DAYS = 60
LIVE_INVITATION = ("pending", "accepted")


def _now() -> datetime:
    return datetime.utcnow()


def _summary(content: bytes, filename: str) -> dict:
    sheets, files = read_cis_workbook(content, filename)
    export = cis_export(sheets, files)
    groups: dict[str, int] = {}
    for item in export["items"]:
        groups[item["group"]] = groups.get(item["group"], 0) + 1
    return {"items": len(export["items"]), "groups": groups}


def _drop(held: HeldPortfolioImport, status: str) -> None:
    held.status, held.content, held.updated_at = status, None, _now()


def purge(db: Session) -> int:
    """Delete held exports nobody can accept any more: past their date, or their invitation revoked, declined or expired."""
    now, dropped = _now(), 0
    rows = db.exec(select(HeldPortfolioImport).where(HeldPortfolioImport.status == "held")).all()
    invitations = {row.id: row for row in db.exec(select(OrganizationInvitation).where(col(OrganizationInvitation.id).in_([held.invitation_id for held in rows if held.invitation_id]))).all()} if rows else {}
    for held in rows:
        invitation = invitations.get(held.invitation_id) if held.invitation_id else None
        gone = held.invitation_id is not None and (invitation is None or invitation.status not in LIVE_INVITATION or (invitation.status == "pending" and invitation.expires_at <= now))
        if held.expires_at <= now or gone:
            _drop(held, "expired")
            db.add(held)
            dropped += 1
    if dropped:
        db.commit()
    return dropped


def purge_with(engine) -> int:
    with Session(engine) as db:
        return purge(db)


async def run_forever(engine, every: int = 900) -> None:
    """Started with the app: clears held exports that can no longer be accepted every 15 minutes."""
    import asyncio

    while True:
        try:
            await asyncio.to_thread(purge_with, engine)
        except Exception:
            logger.exception("Clearing held CIS imports failed; will retry")
        await asyncio.sleep(every)


def _member(db: Session, org_id: int, email: str) -> User | None:
    user = db.exec(select(User).where(func.lower(User.email) == email)).first()
    if user and db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user.id)).first():
        return user
    return None


def _hold(db: Session, org_id: int, export: dict, email: str, current_user: PublicUser, invitation: OrganizationInvitation | None = None, user: User | None = None) -> HeldPortfolioImport:
    # One held export per learner and organization: sending again replaces what was waiting.
    for old in db.exec(select(HeldPortfolioImport).where(HeldPortfolioImport.org_id == org_id, HeldPortfolioImport.email_normalized == email, HeldPortfolioImport.status == "held")).all():
        _drop(old, "withdrawn")
        db.add(old)
    now = _now()
    held = HeldPortfolioImport(
        held_uuid=f"held_{uuid4().hex}", org_id=org_id, invitation_id=invitation.id if invitation else None, email_normalized=email,
        learner_name=export["name"][:200], target_user_id=user.id if user else None, created_by_user_id=current_user.id,
        filename=export["filename"][:200], content=export["content"], summary=_summary(export["content"], export["filename"]),
        expires_at=invitation.expires_at if invitation else now + timedelta(days=HOLD_DAYS), created_at=now, updated_at=now,
    )
    db.add(held)
    return held


def send_waiting_email(org: Organization, inviter: PublicUser, email: str, link: str, idempotency_key: str) -> None:
    """For a learner who already has a way in: their CIS work is waiting on their portfolio's import page."""
    who = " ".join(part for part in (inviter.first_name, inviter.last_name) if part) or org.name
    send_email(
        to=email,
        subject=f"Your Oregon CIS work is waiting for you in {org.name}",
        body=f"""
<html>
    <body>
        <p>{html.escape(who)} sent over your work from Oregon CIS, so you don't lose it when CIS closes.</p>
        <p><a href="{link}">See your CIS work</a></p>
        <p>Nothing is added to your portfolio until you say so. Only you and the staff who sent it can see it.</p>
    </body>
</html>
""",
        idempotency_key=idempotency_key,
    )


async def send(request: Request, org_id: int, content: bytes, filename: str, picks: list[dict], note: str, usergroup_id: int | None, current_user: PublicUser, db: Session) -> dict:
    """Invite each picked learner ({key, email}) from a CIS export, holding their CIS work for them."""
    from src.services.orgs import users as org_users

    require_org_admin(current_user.id, org_id, db, "manage_learners")
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    purge(db)
    exports = {export["key"]: export for export in bulk.learner_exports(content, filename)}
    chosen: dict[str, dict] = {}
    results: list[dict] = []
    for pick in picks:
        export = exports.get(str(pick.get("key") or ""))
        email = org_users.normalize_email(str(pick.get("email") or (export or {}).get("email") or ""))
        if export is None:
            results.append({"key": pick.get("key"), "email": email, "status": "missing", "detail": "This learner isn't in the file"})
        elif not org_users.is_valid_email(email):
            results.append({"key": export["key"], "email": email, "status": "invalid", "detail": "Enter a valid email address"})
        elif email in chosen:
            results.append({"key": export["key"], "email": email, "status": "duplicate", "detail": "Another learner here has this email"})
        else:
            chosen[email] = export
    if not chosen:
        if results:
            return {"sent": 0, "results": results}
        raise HTTPException(status_code=400, detail="Pick at least one learner to invite")

    batch = f"cis_{uuid4().hex}"
    held_by_email: dict[str, HeldPortfolioImport] = {}

    def hold_new(invitations: list[OrganizationInvitation]) -> None:
        for invitation in invitations:
            held_by_email[invitation.email_normalized] = _hold(db, org_id, chosen[invitation.email_normalized], invitation.email_normalized, current_user, invitation=invitation)
        db.commit()

    invited = await org_users.invite_batch_users(
        request, org_id, InviteUsersRequest(emails=list(chosen), role_id=USER_ROLE_ID, usergroup_id=usergroup_id, source="cis", batch_uuid=batch, note=note),
        db, current_user, before_delivery=hold_new,
    )
    base_url = get_base_url_from_request(request)
    for outcome in invited.results:
        email = org_users.normalize_email(outcome.email)
        export = chosen.get(email)
        if export is None:
            continue
        row = {"key": export["key"], "email": email, "status": outcome.status, "detail": outcome.detail}
        if outcome.status == "invited":
            row["status"], row["email_sent"] = "invited", outcome.email_sent
        elif outcome.status in ("already_member", "already_invited"):
            user = _member(db, org_id, email)
            pending = None if user else db.exec(select(OrganizationInvitation).where(
                OrganizationInvitation.org_id == org_id, OrganizationInvitation.email_normalized == email,
                OrganizationInvitation.status == "pending", OrganizationInvitation.expires_at > _now(),
            )).first()
            held = _hold(db, org_id, export, email, current_user, invitation=pending, user=user)
            db.commit()
            link = f"{base_url}/portfolio/import" if user else f"{base_url}/signup?invitation={pending.invitation_uuid}" if pending else f"{base_url}/portfolio/import"
            try:
                await run_in_threadpool(send_waiting_email, org, current_user, email, link, f"{held.held_uuid}:1")
                row["email_sent"] = True
            except EmailDeliveryError as error:
                row["email_sent"], row["detail"] = False, f"Their CIS work is waiting, but the email didn't send. {error.reason}"
            except Exception:
                logger.exception("CIS waiting email for %s failed", held.held_uuid)
                row["email_sent"], row["detail"] = False, "Their CIS work is waiting, but the email didn't send."
            row["status"] = "waiting_member" if user else "waiting_invited"
        results.append(row)
    return {"sent": sum(row["status"] in ("invited", "waiting_member", "waiting_invited") for row in results), "results": results}


def _visible(db: Session, org_id: int, current_user: PublicUser):
    statement = select(HeldPortfolioImport).where(HeldPortfolioImport.org_id == org_id)
    if not is_org_owner_admin(current_user.id, org_id, db):
        statement = statement.where(HeldPortfolioImport.created_by_user_id == current_user.id)
    return statement


def sent_list(org_id: int, current_user: PublicUser, db: Session) -> list[dict]:
    """The CIS work this staff member sent (admins see everyone's), newest first. Never the export itself."""
    require_org_admin(current_user.id, org_id, db, "manage_learners")
    purge(db)
    rows = db.exec(_visible(db, org_id, current_user).order_by(col(HeldPortfolioImport.id).desc()).limit(500)).all()
    return [{
        "held_uuid": row.held_uuid, "learner_name": row.learner_name, "email": row.email_normalized, "status": row.status,
        "summary": row.summary, "added": row.added, "created_at": row.created_at.isoformat(), "expires_at": row.expires_at.isoformat(),
        "imported_at": row.imported_at.isoformat() if row.imported_at else None,
    } for row in rows]


def withdraw(org_id: int, held_uuid: str, current_user: PublicUser, db: Session) -> dict:
    """Stop holding a learner's CIS work: the export is deleted. The invitation itself stays until revoked."""
    require_org_admin(current_user.id, org_id, db, "manage_learners")
    held = db.exec(_visible(db, org_id, current_user).where(HeldPortfolioImport.held_uuid == held_uuid)).first()
    if not held:
        raise HTTPException(status_code=404, detail="Not found")
    if held.status != "held":
        raise HTTPException(status_code=409, detail="This CIS work is no longer waiting")
    _drop(held, "withdrawn")
    db.add(held)
    db.commit()
    return {"held_uuid": held.held_uuid, "status": held.status}


def waiting_for_invitation(db: Session, invitation: OrganizationInvitation) -> HeldPortfolioImport | None:
    """The CIS work held for a CIS invitation, if it is still waiting."""
    if invitation.source != "cis" or invitation.id is None:
        return None
    return db.exec(select(HeldPortfolioImport).where(HeldPortfolioImport.invitation_id == invitation.id, HeldPortfolioImport.status == "held")).first()


# ---------------------------------------------------------------- the learner's side (DEV-41)

async def bring_in(db: Session, held: HeldPortfolioImport, user: User) -> dict:
    """Copy held CIS work into the learner's portfolio once, then delete the held export.

    Items already in the portfolio (from an earlier CIS import or typed in by hand) are skipped, so it never
    duplicates anything."""
    from src.services.portfolio_imports import import_content

    if held.status != "held" or not held.content:
        raise HTTPException(status_code=409, detail="This CIS work is no longer waiting")
    learner = PublicUser.model_validate(user)
    result = await import_content(held.source, held.content, held.filename or "Oregon CIS data.xlsx", None, learner, db)
    held.target_user_id, held.added, held.imported_at = user.id, result["added"], _now()
    _drop(held, "imported")
    db.add(held)
    db.commit()
    return result


async def after_accept(db: Session, invitation: OrganizationInvitation, user_id: int) -> None:
    """A CIS invitation was accepted: bring the learner's CIS work into their portfolio.

    Never stops them joining. If it fails, the work stays waiting and they can bring it in from their portfolio."""
    held = waiting_for_invitation(db, invitation)
    user = db.get(User, user_id) if held else None
    if not held or not user:
        return
    try:
        await bring_in(db, held, user)
    except Exception:
        logger.exception("Bringing in held CIS work %s failed; it stays waiting", held.held_uuid)
        db.rollback()
        held = db.get(HeldPortfolioImport, held.id)
        if held and held.status == "held":
            held.target_user_id = user_id
            db.add(held)
            db.commit()


def _mine(db: Session, current_user: PublicUser):
    """Held CIS work the learner can bring in now: theirs by account or email, and not waiting on an invitation."""
    email = " ".join(str(current_user.email or "").split()).lower()
    rows = db.exec(select(HeldPortfolioImport).where(
        HeldPortfolioImport.status == "held",
        (HeldPortfolioImport.target_user_id == current_user.id) | (HeldPortfolioImport.email_normalized == email),
    )).all()
    invitations = {row.id: row for row in db.exec(select(OrganizationInvitation).where(col(OrganizationInvitation.id).in_([held.invitation_id for held in rows if held.invitation_id]))).all()} if rows else {}
    member_of = set(db.exec(select(UserOrganization.org_id).where(UserOrganization.user_id == current_user.id)).all())
    # A held export on a pending invitation comes over when they accept it; until then it isn't offered here.
    return [held for held in rows if held.org_id in member_of and (held.invitation_id is None or getattr(invitations.get(held.invitation_id), "status", None) == "accepted")]


def waiting_for_me(current_user: PublicUser, db: Session) -> list[dict]:
    purge(db)
    held_rows = _mine(db, current_user)
    orgs = {org.id: org for org in db.exec(select(Organization).where(col(Organization.id).in_([held.org_id for held in held_rows]))).all()} if held_rows else {}
    senders = {user.id: user for user in db.exec(select(User).where(col(User.id).in_([held.created_by_user_id for held in held_rows if held.created_by_user_id]))).all()} if held_rows else {}
    out = []
    for held in held_rows:
        sender = senders.get(held.created_by_user_id)
        out.append({
            "held_uuid": held.held_uuid, "org_name": orgs[held.org_id].name if held.org_id in orgs else "",
            "sent_by": " ".join(part for part in ((sender.first_name, sender.last_name) if sender else ()) if part),
            "summary": held.summary, "expires_at": held.expires_at.isoformat(),
        })
    return out


def _my_held(held_uuid: str, current_user: PublicUser, db: Session) -> HeldPortfolioImport:
    held = next((row for row in _mine(db, current_user) if row.held_uuid == held_uuid), None)
    if not held:
        raise HTTPException(status_code=404, detail="Not found")
    return held


async def accept_mine(held_uuid: str, current_user: PublicUser, db: Session) -> dict:
    held = _my_held(held_uuid, current_user, db)
    user = db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return await bring_in(db, held, user)


def decline_mine(held_uuid: str, current_user: PublicUser, db: Session) -> dict:
    held = _my_held(held_uuid, current_user, db)
    _drop(held, "declined")
    db.add(held)
    db.commit()
    return {"held_uuid": held.held_uuid, "status": held.status}
