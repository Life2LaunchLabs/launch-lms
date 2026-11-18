"""Answering a parent's records request from a learner's page (OP-3): download the learner's records, see who
opened them, and delete the learner and their data.

Only an organization's admins do these. The export holds only this organization's records: the plans it gave the
learner with their step answers and hand-ins, the portfolio as the learner shares it with the organization, badges
the organization issued and, when it keeps school records, the learner's Education Plan and Profile. Notes staff
wrote only for staff stay out, as they do in the learner's own download.

Delete removes the account and everything that cascades from it (services/users/files.delete_user_and_files), but a
school keeps a supported learner's Education Plan and Profile records (``freeze_exits``), and the access log keeps
its rows, which name staff, not the learner. For now only a learner whose account belongs to this organization alone
can be deleted here; an account that also belongs to another organization waits on a decision (v0.11.0 page).
"""

from __future__ import annotations

import datetime as dt
import io
import logging
import re
import tempfile
import zipfile

from fastapi import HTTPException
from sqlmodel import Session, col, func, select

from src.db.badges import BadgeAward
from src.db.epp_records import EppRecord
from src.db.goals import Goal, GoalOwnership, GoalStage, GoalStep, StepEntry, StepProgress
from src.db.learner_support import LearnerSupport
from src.db.media import MediaAsset
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_owner_admin
from src.services.orgs import records_access
from src.services.orgs.owner import owner_org
from src.services.school import roles
from src.services.utils.storage import read_file_content

logger = logging.getLogger(__name__)

MAX_FILE_BYTES = 300 * 1024 * 1024
STEP_STATUS = {"not_started": "Not started", "in_progress": "In progress", "submitted": "Handed in, waiting for review",
               "needs_changes": "Sent back for changes", "completed": "Done", "skipped": "Skipped", "excused": "Excused"}
GOAL_STATUS = {"draft": "Being set up", "pending": "Not accepted yet", "active": "Active", "finished": "Finished", "archived": "Archived"}


def _value(value) -> str:
    return str(getattr(value, "value", value) or "")


def _learner(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> User:
    """The learner, when the viewer is an admin of the organization and the learner belongs to it."""
    if not is_org_owner_admin(current_user.id, org_id, db):
        raise HTTPException(status_code=403, detail="Only the organization's admins can answer a records request")
    user = db.get(User, user_id)
    if not user or roles.org_role(db, org_id, user_id) != "learner":
        raise HTTPException(status_code=404, detail="That learner isn't in this organization")
    return user


def _name(user: User) -> str:
    return " ".join(part for part in [user.first_name, user.last_name] if part).strip() or user.username or "Learner"


def _when(value) -> str:
    if not value:
        return ""
    if isinstance(value, (dt.date, dt.datetime)):
        return value.strftime("%b %-d, %Y")
    try:
        return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00")).strftime("%b %-d, %Y")
    except ValueError:
        return str(value)[:10]


# ---------------------------------------------------------------- what the organization keeps

def _goals(db: Session, org_id: int, user_id: int) -> list[Goal]:
    """The plans this organization gave the learner (assigned or joined from it), oldest first."""
    return list(db.exec(select(Goal).where(
        Goal.org_id == org_id, Goal.subject_user_id == user_id, Goal.ownership == GoalOwnership.EXTERNAL.value,
    ).order_by(col(Goal.id))).all())


def _text(progress: StepProgress | None) -> list[str]:
    from src.services.epp.report import _plain, _submission_text

    if not progress:
        return []
    texts = _submission_text(progress.submission or {})
    for extra in (progress.answer, progress.learner_note):
        if _plain(extra):
            texts.append(_plain(extra))
    return texts


def collect(db: Session, org_id: int, user: User, viewer: PublicUser) -> dict:
    """Everything the export holds, as plain data (the PDF is drawn from it)."""
    from src.services.epp.report import _plain

    user_id = int(user.id)  # type: ignore[arg-type]
    org = db.get(Organization, org_id)
    membership = db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first()
    groups = [row.name for row in db.exec(select(UserGroup).join(UserGroupUser, UserGroupUser.usergroup_id == UserGroup.id).where(
        UserGroupUser.user_id == user_id, UserGroupUser.org_id == org_id)).all()]
    plans, files = [], []
    for goal in _goals(db, org_id, user_id):
        stages = {int(stage.id): stage.title for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all()}  # type: ignore[arg-type]
        steps = []
        for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id).order_by(col(GoalStep.position), col(GoalStep.id))).all():
            progress = db.exec(select(StepProgress).where(StepProgress.step_id == step.id)).first()
            handed = []
            for entry in db.exec(select(StepEntry).where(StepEntry.step_id == step.id).order_by(col(StepEntry.position), col(StepEntry.id))).all():
                kind = _value(entry.kind)
                url = entry.url
                if entry.asset_id:
                    asset = db.get(MediaAsset, entry.asset_id)
                    url = (asset.url if asset else "") or url
                    if asset:
                        files.append({"asset": asset, "url": url, "step": step.title, "plan": goal.title})
                elif kind == "file" and url:
                    files.append({"asset": None, "url": url, "step": step.title, "plan": goal.title})
                label = _plain(entry.title) or _plain(entry.note) or (url.rsplit("/", 1)[-1] if url else "")
                if label or url:
                    handed.append({"kind": kind, "label": label, "url": url if kind in ("link", "resource") else "", "file": kind == "file" or bool(entry.asset_id)})
            feedback = [_plain(item.get("note") or item.get("text") or item.get("message") or "") for item in (progress.feedback_history if progress else []) or [] if isinstance(item, dict)]
            if progress and _plain(progress.reviewer_note):
                feedback.append(_plain(progress.reviewer_note))
            steps.append({
                "stage": stages.get(int(step.stage_id)) if step.stage_id else None, "title": step.title, "type": step.type,
                "status": STEP_STATUS.get(_value(progress.status) if progress else "not_started", _value(progress.status) if progress else "Not started"),
                "completed_at": _when(progress.completed_at) if progress else "", "due": _when(step.due_date),
                "answers": _text(progress), "handed_in": handed, "feedback": [item for item in dict.fromkeys(feedback) if item],
            })
        plans.append({"title": goal.title, "status": GOAL_STATUS.get(_value(goal.status), _value(goal.status)),
                      "started": _when(goal.creation_date), "finished": _when(goal.finished_at), "steps": steps})
    badges = [{"name": (award.achievement or {}).get("name") or "Badge", "earned": _when(award.earned_on), "status": _value(award.status)}
              for award in db.exec(select(BadgeAward).where(BadgeAward.user_id == user_id, BadgeAward.issuing_org_id == org_id).order_by(col(BadgeAward.earned_on))).all()]
    portfolio = None
    try:
        from src.services.portfolio_people import shared_shell

        shell = shared_shell(db, viewer, org_id, user.username)
        portfolio = {
            "headline": (shell.get("portfolio") or {}).get("headline") or "", "bio": (shell.get("portfolio") or {}).get("short_bio") or "",
            "projects": [{"title": item.get("title") or "", "summary": _plain(item.get("subtitle") or item.get("summary") or "")} for item in shell.get("projects") or []],
            "timeline": [{"title": item.get("title") or "", "organization": item.get("organization") or "",
                          "when": " – ".join(part for part in [item.get("start_date") or "", "now" if item.get("is_ongoing") else item.get("end_date") or ""] if part)}
                         for item in (shell.get("timeline") if isinstance(shell.get("timeline"), list) else [])],
        }
    except HTTPException:
        portfolio = None
    return {
        "org": org.name if org else "", "learner": _name(user), "username": user.username, "email": user.email,
        "joined": _when(membership.creation_date) if membership else "", "status": (membership.status or "active") if membership else "",
        "groups": groups, "plans": plans, "badges": badges, "portfolio": portfolio, "files": files,
    }


# ---------------------------------------------------------------- the readable file

def render(data: dict, generated: dt.datetime, extras: list[str], file_name: str = "records.pdf") -> bytes:
    """The records as one PDF a parent can read."""
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.units import inch
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer

    from src.services.epp.pdf import MUTED, _drawable, _safe, _styles, _table

    styles = _styles()
    buffer = io.BytesIO()

    def footer(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont("Vera", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(0.75 * inch, 0.5 * inch, _drawable(f"{data['learner']} · Records kept by {data['org']} · {generated:%b %-d, %Y}"))
        canvas.drawRightString(LETTER[0] - 0.75 * inch, 0.5 * inch, f"Page {doc.page}")
        canvas.restoreState()

    def para(text: str, style: str = "body") -> Paragraph:
        return Paragraph(_safe(text), styles[style])

    story: list = [para(data["org"].upper(), "kicker"), Spacer(1, 4), para(data["learner"], "title"), Spacer(1, 4),
                   para(f"The records {data['org']} keeps about {data['learner']}, as of {generated:%B %-d, %Y}.", "muted"), Spacer(1, 14)]
    about = [["Name", data["learner"]], ["Username", f"@{data['username']}"]]
    if data.get("email"):
        about.append(["Email", data["email"]])
    if data.get("joined"):
        about.append(["Joined", data["joined"]])
    if data.get("status"):
        about.append(["Status", data["status"].capitalize()])
    if data["groups"]:
        about.append(["Groups", ", ".join(data["groups"])])
    story += [para("Profile", "h2"), _table(about, None, styles, [1.6 * inch, 5.4 * inch]), Spacer(1, 10)]

    story.append(para("Plans", "h2"))
    if not data["plans"]:
        story.append(para("No plans from this organization.", "muted"))
    for plan in data["plans"]:
        dates = " · ".join(part for part in [plan["status"], f"started {plan['started']}" if plan["started"] else "", f"finished {plan['finished']}" if plan["finished"] else ""] if part)
        block = [para(plan["title"], "h3"), para(dates, "muted"), Spacer(1, 4)]
        story.append(KeepTogether(block))
        for step in plan["steps"]:
            lines = [Paragraph(f"<b>{_safe(step['title'])}</b>", styles["body"]),
                     para(" · ".join(part for part in [step["stage"] or "", step["status"], f"done {step['completed_at']}" if step["completed_at"] else "", f"due {step['due']}" if step["due"] and not step["completed_at"] else ""] if part), "muted")]
            for answer in step["answers"]:
                lines.append(para(answer))
            for item in step["handed_in"]:
                where = " (file, in the files folder)" if item["file"] else (f" ({item['url']})" if item["url"] else "")
                lines.append(para(f"Handed in: {item['label']}{where}"))
            for note in step["feedback"]:
                lines.append(para(f"Feedback: {note}", "muted"))
            lines.append(Spacer(1, 6))
            story.append(KeepTogether(lines))
        story.append(Spacer(1, 6))

    if data["badges"]:
        story += [para("Badges", "h2"), _table([[item["name"], item["earned"], "Revoked" if item["status"] == "revoked" else ""] for item in data["badges"]],
                                                ["Badge", "Earned", ""], styles, [3.8 * inch, 1.6 * inch, 1.6 * inch]), Spacer(1, 10)]

    story.append(para("Portfolio", "h2"))
    portfolio = data.get("portfolio")
    if not portfolio:
        story.append(para(f"{data['learner']} hasn't shared a portfolio with {data['org']}.", "muted"))
    else:
        story.append(para("What the learner shares with the organization. Anything they marked private is left out.", "muted"))
        for text in (portfolio["headline"], portfolio["bio"]):
            if text:
                story.append(para(text))
        if portfolio["projects"]:
            story += [para("Projects", "h3"), _table([[item["title"], item["summary"]] for item in portfolio["projects"]], None, styles, [2.4 * inch, 4.6 * inch])]
        if portfolio["timeline"]:
            story += [para("Timeline", "h3"), _table([[item["title"], " · ".join(part for part in [item["organization"], item["when"]] if part)] for item in portfolio["timeline"]], None, styles, [2.4 * inch, 4.6 * inch])]
    story.append(Spacer(1, 10))

    story += [para("In this download", "h2")]
    for line in [f"{file_name}: this file.", *extras,
                 "Not included: notes staff wrote only for other staff, sign-in details, and anything the learner keeps only for themselves."]:
        story.append(para(f"• {line}"))

    doc = SimpleDocTemplate(buffer, pagesize=LETTER, leftMargin=0.75 * inch, rightMargin=0.75 * inch, topMargin=0.7 * inch, bottomMargin=0.8 * inch,
                            title=f"{data['learner']}: records", author=data["org"])
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()


def _stem(value: str) -> str:
    return re.sub(r"[^\w\- ]+", "", value).strip().replace(" ", "_") or "learner"


def _file_name(raw: str, used: set[str]) -> str:
    base = re.sub(r"[^\w.\- ]+", "_", raw).strip(" .") or "file"
    name, n = base, 1
    while name.lower() in used:
        stem, dot, ext = base.rpartition(".")
        name = f"{stem or base} ({n}){dot}{ext}" if dot else f"{base} ({n})"
        n += 1
    used.add(name.lower())
    return name


def export(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> tuple[str, tempfile.SpooledTemporaryFile]:
    """A zip with the readable records PDF, the Education Plan and Profile PDFs and the files the learner handed in."""
    from src.services.orgs import school_records
    from src.services.users.data_export import _content_key

    user = _learner(db, current_user, org_id, user_id)
    generated = dt.datetime.now(dt.UTC).replace(microsecond=0)
    data = collect(db, org_id, user, current_user)
    name = _name(user)
    out = tempfile.SpooledTemporaryFile(max_size=32 * 1024 * 1024)
    extras: list[str] = []
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        if school_records.enabled(db, org_id):
            from src.services.epp import caseload, pdf, report

            link = db.exec(select(LearnerSupport).where(LearnerSupport.org_id == org_id, LearnerSupport.user_id == user_id)).first()
            if link and link.status == "active":
                try:
                    archive.writestr("Education_Plan_and_Profile.pdf", pdf.render(report.build(db, org_id, user_id)))
                    extras.append("Education_Plan_and_Profile.pdf: their Education Plan and Profile as it stands today.")
                except Exception:
                    logger.exception("records export: couldn't draw the EPP for %s", user_id)
            reviewed = db.exec(select(EppRecord).where(EppRecord.org_id == org_id, EppRecord.user_id == user_id).order_by(col(EppRecord.id))).all()
            for row in reviewed:
                archive.writestr(f"reviewed_records/{caseload.file_name(db, row)}", pdf.render(row.data))
            if reviewed:
                extras.append(f"reviewed_records: {len(reviewed)} reviewed Education Plan and Profile record{'s' if len(reviewed) != 1 else ''}.")
        used: set[str] = set()
        total, included, skipped = 0, 0, 0
        for item in data["files"]:
            asset = item["asset"]
            key = _content_key(str(item["url"] or ""), user.user_uuid)
            body = None
            size = (asset.size_bytes if asset else 0) or 0
            if key and total + size <= MAX_FILE_BYTES:
                try:
                    body = read_file_content(key)
                except Exception:  # one unreadable file never stops the export
                    logger.exception("records export: could not read %s", key)
            if body is None or total + len(body) > MAX_FILE_BYTES:
                skipped += 1
                continue
            raw = (asset.filename if asset else None) or str(item["url"]).rsplit("/", 1)[-1].split("?", 1)[0] or "file"
            archive.writestr(f"files/{_file_name(raw, used)}", body)
            total += len(body)
            included += 1
        if included:
            extras.append(f"files: {included} file{'s' if included != 1 else ''} the learner handed in on these plans.")
        if skipped:
            extras.append(f"{skipped} handed-in file{'s' if skipped != 1 else ''} couldn't be added (too large, or stored somewhere else).")
        archive.writestr(f"{_stem(name)}.pdf", render(data, generated, extras, f"{_stem(name)}.pdf"))
    out.seek(0)
    records_access.note(db, current_user.id, org_id, user_id, "records", action=records_access.EXPORT)
    return f"Records_{_stem(name)}_{generated.date().isoformat()}.zip", out


# ---------------------------------------------------------------- delete

def _other_orgs(db: Session, org_id: int, user_id: int) -> list[str]:
    """Organizations besides this one the account belongs to (the platform's own, which everyone joins, doesn't count)."""
    owner = owner_org(db)
    rows = db.exec(select(Organization).join(UserOrganization, UserOrganization.org_id == Organization.id).where(
        UserOrganization.user_id == user_id, UserOrganization.org_id != org_id)).all()
    return [row.name for row in rows if not owner or row.id != owner.id]


def _count(db: Session, statement) -> int:
    return int(db.exec(select(func.count()).select_from(statement.subquery())).one())


def delete_preview(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    """What deleting the learner removes, what the organization keeps and why, and whether it can be done here."""
    user = _learner(db, current_user, org_id, user_id)
    name = _name(user)
    others = _other_orgs(db, org_id, user_id)
    blocked = None
    if getattr(user, "is_superadmin", False):
        blocked = "This account runs the platform and can't be deleted here."
    elif others:
        blocked = (f"{name}'s account also belongs to {others[0] if len(others) == 1 else 'other organizations'}, so it isn't yours alone to delete. "
                   "Deleting accounts like this is waiting on a decision. You can remove them from your organization instead, which ends your access.")
    plans = _count(db, select(Goal.id).where((Goal.owner_user_id == user_id) | (Goal.subject_user_id == user_id)))
    files = _count(db, select(MediaAsset.id).where(MediaAsset.owner_user_id == user_id))
    reviewed = _count(db, select(EppRecord.id).where(EppRecord.org_id == org_id, EppRecord.user_id == user_id))
    supported = db.exec(select(LearnerSupport.id).where(LearnerSupport.org_id == org_id, LearnerSupport.user_id == user_id, LearnerSupport.status == "active")).first() is not None
    removed = [
        "Their account, so nobody can sign in to it or find it in your organization",
        f"Their plans and every step answer ({plans} plan{'s' if plans != 1 else ''})",
        f"Files they uploaded ({files})",
        "Their chats with staff and every message they sent",
        "Their portfolio, badges, Coach conversations and saved resources",
    ]
    kept = []
    if reviewed or supported:
        parts = []
        if reviewed:
            parts.append(f"{reviewed} reviewed record{'s' if reviewed != 1 else ''}")
        if supported:
            parts.append("an exit record saved now")
        kept.append({"what": f"Their Education Plan and Profile records ({', '.join(parts)})",
                     "why": "Your school holds these records for the learner. You decide later whether to remove them, from School records."})
    kept.append({"what": "The access log of who opened their records",
                 "why": "It names your staff, not the learner, and shows you answered the request."})
    return {"name": name, "username": user.username, "can_delete": blocked is None, "blocked_reason": blocked, "removed": removed, "kept": kept}


def _remove_learner_rows(db: Session, user: User) -> None:
    """What the account delete alone would leave behind with the learner's name taken off: plans staff own for them
    (step answers and hand-ins), their chats with staff and the messages they sent, and invitations to their email.
    Goals they own go too, which the account's RESTRICT key needs anyway. Doesn't commit."""
    from sqlalchemy import delete as sql_delete, or_

    from src.db.conversations import Conversation, ConversationMember, ConversationMessage
    from src.db.goal_sharing import PlanInvitation
    from src.db.organization_invitations import OrganizationInvitation
    from src.db.organization_join_requests import OrganizationJoinRequest

    user_id = int(user.id)  # type: ignore[arg-type]
    email = (user.email or "").strip().lower()
    chats = db.exec(select(Conversation.id).join(ConversationMember, ConversationMember.conversation_id == Conversation.id).where(
        ConversationMember.user_id == user_id, Conversation.kind == "direct")).all()
    school_chats = db.exec(select(Conversation.id).where(col(Conversation.direct_key).like(f"school:%:{user_id}"))).all()
    ids = list({*chats, *school_chats})
    if ids:
        db.exec(sql_delete(ConversationMessage).where(col(ConversationMessage.conversation_id).in_(ids)))  # type: ignore[call-overload]
        db.exec(sql_delete(ConversationMember).where(col(ConversationMember.conversation_id).in_(ids)))  # type: ignore[call-overload]
        db.exec(sql_delete(Conversation).where(col(Conversation.id).in_(ids)))  # type: ignore[call-overload]
    db.exec(sql_delete(ConversationMessage).where(ConversationMessage.sender_user_id == user_id))  # type: ignore[call-overload]
    db.exec(sql_delete(Goal).where(or_(Goal.owner_user_id == user_id, Goal.subject_user_id == user_id)))  # type: ignore[call-overload]
    db.exec(sql_delete(OrganizationInvitation).where(or_(  # type: ignore[call-overload]
        OrganizationInvitation.target_user_id == user_id, *([OrganizationInvitation.email_normalized == email] if email else []))))
    db.exec(sql_delete(PlanInvitation).where(or_(  # type: ignore[call-overload]
        PlanInvitation.target_user_id == user_id, *([PlanInvitation.email_normalized == email] if email else []))))
    db.exec(sql_delete(OrganizationJoinRequest).where(OrganizationJoinRequest.user_id == user_id))  # type: ignore[call-overload]
    db.flush()


def delete(db: Session, current_user: PublicUser, org_id: int, user_id: int, confirm: str) -> dict:
    """Delete the learner and their data. ``confirm`` is their username, typed by the admin."""
    from src.services.epp.records import freeze_exits
    from src.services.users.files import delete_user_and_files

    preview = delete_preview(db, current_user, org_id, user_id)
    if not preview["can_delete"]:
        raise HTTPException(status_code=409, detail=preview["blocked_reason"])
    if int(current_user.id) == int(user_id):
        raise HTTPException(status_code=400, detail="You can't delete your own account here")
    if (confirm or "").strip().lstrip("@").lower() != (preview["username"] or "").lower():
        raise HTTPException(status_code=422, detail="Type their username to confirm")
    user = db.get(User, user_id)
    freeze_exits(db, user_id)  # schools keep a supported learner's EPP record
    _remove_learner_rows(db, user)  # type: ignore[arg-type]
    for membership in db.exec(select(UserOrganization).where(UserOrganization.user_id == user_id)).all():
        db.delete(membership)
    db.flush()
    delete_user_and_files(db, user)  # type: ignore[arg-type]
    try:
        from src.services.superadmin.users import _invalidate_session_cache

        _invalidate_session_cache(user_id)
    except Exception:
        logger.exception("records delete: couldn't clear the session cache for %s", user_id)
    records_access.note(db, current_user.id, org_id, user_id, "records", action=records_access.DELETE)
    return {"detail": f"{preview['name']} and their data were deleted"}


def access(db: Session, current_user: PublicUser, org_id: int, user_id: int, offset: int = 0) -> dict:
    _learner(db, current_user, org_id, user_id)
    return records_access.history(db, org_id, user_id, offset=offset)
