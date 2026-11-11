"""User test tools for the Launch LMS MCP server: a platform admin's connector runs a test cohort.

The same rules as Platform › User tests: platform admins only, off unless user tests are enabled,
and a login link is only ever made for a test persona. A thread testing as a persona uses these to
read the persona's mail and to log progress and findings while it works in the browser.
"""

from __future__ import annotations

import html as html_lib
import re
from datetime import timedelta
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from sqlmodel import Session

from src.db.user_tests import TestMail, TestPersona
from src.services.oauth.config import frontend_url
from src.services.oauth.server import AccessContext
from src.services.user_tests import checkpoints, cleanup, cohorts, mail, personas, replays, stories, tickets
from src.services.user_tests.sessions import current_test_persona, is_platform_admin
from src.services.user_tests.settings import email_domain, require_enabled

GUIDE = (
    "A cohort is one test run: personas (fresh accounts on the test email domain, sealed off from real people and orgs) "
    "and stages (goals written for the persona, each for named personas or everyone, which can wait for another persona to finish a stage). To test as a "
    "persona, open the link from open_as_test_persona in a fresh browser session, work through its stages as that person "
    "would, read the email the site sends it with read_test_mail, and note progress and findings as you go. Everything "
    "the seal refuses shows up in the report on its own."
)


def _require_operator(db: Session, ctx: AccessContext) -> None:
    require_enabled()
    if current_test_persona.get() or not is_platform_admin(ctx.user.id, db):
        raise HTTPException(403, "Only platform admins can run user tests.")


def _console_url(db: Session, ctx: AccessContext, cohort_uuid: str = "") -> str:
    from src.services import learning

    org = learning._get_org(db, ctx.default_org_id or ctx.org_id)
    return f"{frontend_url()}/orgs/{org.slug}/admin/platform/user-tests" + (f"/{cohort_uuid}" if cohort_uuid else "")


def _persona(db: Session, user_id) -> TestPersona:
    persona = db.get(TestPersona, int(user_id))
    if not persona:
        raise HTTPException(404, "There is no test persona with that user_id.")
    return persona


def _text(body: str | None) -> str:
    """An email's HTML as plain text, for a model to read."""
    body = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", " ", body or "")
    body = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|h[1-6]|li)>", "\n", body)
    body = html_lib.unescape(re.sub(r"<[^>]+>", " ", body))
    return "\n".join(line for line in (re.sub(r"[ \t]+", " ", raw).strip() for raw in body.splitlines()) if line)


async def list_test_cohorts(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    return {"guide": GUIDE, "email_domain": email_domain(), "cohorts": cohorts.list_cohorts(db), "console_url": _console_url(db, ctx)}


async def get_test_cohort(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    cohort = cohorts.get_cohort(db, str(args["cohort_uuid"]))
    return {**cohorts.serialize(db, cohort, detail=True), "board": stories.board(db, cohort.cohort_uuid),
            "checkpoints": checkpoints.list_checkpoints(db, cohort.cohort_uuid), "console_url": _console_url(db, ctx, cohort.cohort_uuid)}


async def create_test_cohort(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    cohort = cohorts.create_cohort(db, int(ctx.user.id), cohorts.CreateCohort(**args))  # type: ignore[arg-type]
    return {**cohort, "console_url": _console_url(db, ctx, cohort["cohort_uuid"])}


async def add_test_personas(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    made = await personas.create_personas(db, str(args["cohort_uuid"]), personas.CreatePersonas(personas=args["personas"]))
    return {"personas": made}


async def set_test_stages(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    return stories.set_stages(db, str(args["cohort_uuid"]), stories.SetStages(stages=args["stages"]))


async def get_test_board(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    return stories.board(db, str(args["cohort_uuid"]))


async def open_as_test_persona(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    target, origin = str(args.get("target_path") or "/"), frontend_url()
    if target.startswith(("http://", "https://")):
        # A link from the persona's mail: sign in on that link's own site (an org's host), then open it.
        path = mail.on_site_path(target)
        if path is None:
            raise HTTPException(400, "That link isn't on this site.")
        parts = urlsplit(target)
        target, origin = path, f"{urlsplit(origin).scheme}://{parts.netloc}"
    minutes = min(max(int(args.get("valid_minutes") or 1), 1), 30)
    link = tickets.mint(db, int(ctx.user.id), int(args["user_id"]), target, timedelta(minutes=minutes))  # type: ignore[arg-type]
    return {"url": f"{origin}{link['path']}", "expires_at": link["expires_at"],
            "note": "Works once. Open it in a fresh browser session (no other sign-in), since it signs that browser in as the persona. "
                    "It also signs a persona back in after its session drops, with no admin sign-in in that browser."}


async def read_test_mail(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    if args.get("mail_id"):
        found = db.get(TestMail, int(args["mail_id"]))
        if not found or (args.get("user_id") and found.to_user_id != int(args["user_id"])):
            raise HTTPException(404, "That email isn't in this persona's inbox.")
        read = mail.read_mail(db, int(found.id))  # type: ignore[arg-type]
        return {**{key: value for key, value in read.items() if key != "html"}, "text": _text(read.get("html"))}
    persona = _persona(db, args["user_id"])
    return {"mail": mail.list_mail(db, persona.cohort_id, persona.user_id, limit=int(args.get("limit") or 20))}


async def report_test_progress(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    persona = _persona(db, args.pop("user_id"))
    body = stories.Progress(**args)
    state = stories.report_progress(db, persona, body, by="tester")
    if body.status == "done":
        checkpoints.capture_after_stage(persona.cohort_id, body.stage_key)
    return state


async def log_test_finding(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    persona = _persona(db, args.pop("user_id"))
    return stories.log_finding(db, persona, stories.Finding(**args))


async def log_test_step(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    persona = _persona(db, args.pop("user_id"))
    return stories.log_step(db, persona, stories.Step(**args))


async def get_test_report(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    uuid = str(args["cohort_uuid"])
    return {"markdown": stories.report(db, uuid), "counts": stories.board(db, uuid)["counts"], "console_url": _console_url(db, ctx, uuid)}


async def close_test_cohort(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    return cohorts.close_cohort(db, str(args["cohort_uuid"]))


async def purge_test_cohort(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    return cleanup.purge(db, str(args["cohort_uuid"]), dry_run=args.get("dry_run", True) is not False)


async def capture_test_checkpoint(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    return checkpoints.capture_now(db, str(args["cohort_uuid"]), int(ctx.user.id), args.get("stage_key") or None, str(args.get("label") or ""))  # type: ignore[arg-type]


async def publish_test_checkpoint(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    result = checkpoints.publish(db, str(args["checkpoint_id"]), int(ctx.user.id))  # type: ignore[arg-type]
    return {**result, "note": "New demo visits start from this checkpoint." if result["demo_enabled"] else "Published, but the demo is turned off in Demo Studio, so visitors can't start it yet."}


async def replay_test_cohort(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_operator(db, ctx)
    made = await replays.replay(db, str(args["cohort_uuid"]), int(ctx.user.id), int(args.get("days") or 7))  # type: ignore[arg-type]
    return {**made, "console_url": _console_url(db, ctx, made["cohort_uuid"])}
