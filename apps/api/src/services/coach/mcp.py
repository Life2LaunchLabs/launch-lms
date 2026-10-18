"""Coach tools for the Launch LMS MCP server: read the coaching policy, write the draft's knowledge and tests, run tests.

Platform admins only. Tools change the draft, never what learners get: a person releases the draft
on Platform › Coach › Releases.
"""

from __future__ import annotations

import asyncio

from fastapi import HTTPException, Request
from sqlmodel import Session

from src.db.coach import CoachPlaybookWrite, CoachTestWrite
from src.services import learning
from src.services.coach import policy as coach_policy
from src.services.coach import releases, scenarios, sharing
from src.services.oauth.config import frontend_url
from src.services.oauth.server import AccessContext

KNOWLEDGE_GUIDE = (
    "Coach reads the method on every call. Playbooks marked always are added to every call; the others are matched by "
    f"words they share (title and used_when) with the learner's message or the moment, at most {coach_policy.MATCHED_PLAYBOOKS} "
    f"per call, and all knowledge together is capped at {coach_policy.MAX_KNOWLEDGE_CHARS} characters. Routines add "
    "instructions when a trigger happens. Write playbooks as guidance to Coach, in the coaching team's voice; give used_when "
    "the words a learner would actually use. Changes go to the draft; learners get them only when a person releases the draft."
)

TEST_GUIDE = (
    "A test is one moment with a made-up learner: they send a message, create a goal, or talk with Coach for a few turns while "
    "another model plays them from a persona you write (how they act and react; Coach never sees it). Coach answers exactly as it "
    "would a real learner, through the same prompt and context, so write the learner and their words the way real learners write: "
    "a filled-in portfolio, goals with real next steps, a message with typos or hedging if that's how people talk. Never mention "
    "tests, scenarios, evaluation or the rubric in what the learner says or in their portfolio. Rubric lines are graded one at a "
    "time by a separate model that sees only the response, so make each one observable in a single reply (\"asks at most one "
    "question\", not \"builds rapport\"). Use must for rules (safety, never creating a goal, staying within 1,600 characters) "
    f"and should for coaching judgment. Each test runs {scenarios.RUNS} times on the draft and on the live release."
)
_running: set[asyncio.Task] = set()

def _require_platform_admin(ctx: AccessContext) -> None:
    if not getattr(ctx.user, "is_superadmin", False):
        raise HTTPException(status_code=403, detail="Only platform admins can work on Coach.")


def _coach_url(db: Session, ctx: AccessContext, tab: str = "") -> str:
    org = learning._get_org(db, ctx.default_org_id or ctx.org_id)
    return f"{frontend_url()}/orgs/{org.slug}/admin/platform/coach{tab}"


def _book(book: dict) -> dict:
    return {key: book[key] for key in ("playbook_uuid", "title", "used_when", "body", "always", "enabled")}


async def get_coach_policy(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_platform_admin(ctx)
    view = coach_policy.policy_view(db)
    return {
        "guide": KNOWLEDGE_GUIDE,
        "method": view["method"],
        "playbooks": [_book(book) for book in view["playbooks"]],
        "routines": [{key: item[key] for key in ("routine_uuid", "name", "trigger", "instructions", "tier", "enabled")} for item in view["routines"]],
        "triggers": [{"key": item["key"], "label": item["label"], "detail": item["detail"]} for item in view["triggers"]],
        "abilities": [{"key": item["key"], "label": item["label"], "enabled": item["enabled"]} for item in view["abilities"]],
        "built_in_rules": view["built_in_rules"],
        "release": view["release"],
        "editor_url": _coach_url(db, ctx),
    }


async def preview_coach_knowledge(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    """Which playbooks the draft would give Coach for a learner message."""
    _require_platform_admin(ctx)
    message = str(args["message"])
    draft = coach_policy.draft_runtime(db)
    chosen = draft.knowledge(message)
    titles = [book["title"] for book in draft.playbooks if f'title="{book["title"]}"' in chosen]
    return {"message": message, "playbooks": titles, "knowledge": chosen}


async def save_coach_playbook(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_platform_admin(ctx)
    uuid = args.pop("playbook_uuid", None) or None
    payload = CoachPlaybookWrite(**args)
    book = coach_policy.save_playbook(db, ctx.user, payload, uuid)
    return {"playbook": _book(book), "created": uuid is None, "release": releases.summary(db), "editor_url": _coach_url(db, ctx, "/knowledge")}


async def delete_coach_playbook(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_platform_admin(ctx)
    coach_policy.delete_playbook(db, str(args["playbook_uuid"]))
    return {"deleted": args["playbook_uuid"], "release": releases.summary(db), "editor_url": _coach_url(db, ctx, "/knowledge")}


def _brief_run(run: dict | None) -> dict | None:
    """A run without every response, for listing."""
    return {key: value for key, value in run.items() if key != "results"} if run else None


async def list_coach_tests(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_platform_admin(ctx)
    view = scenarios.tests_view(db)
    return {
        "guide": TEST_GUIDE, "moments": view["moments"], "tests": view["tests"], "calls_per_run": view["estimate"],
        "latest_run": _brief_run(view["latest_run"]), "editor_url": _coach_url(db, ctx, "/tests"),
    }


async def save_coach_test(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_platform_admin(ctx)
    uuid = args.pop("test_uuid", None) or None
    test = scenarios.save_test(db, ctx.user, CoachTestWrite(**args), uuid)
    return {"test": test, "created": uuid is None, "editor_url": _coach_url(db, ctx, "/tests")}


async def delete_coach_test(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_platform_admin(ctx)
    scenarios.delete_test(db, str(args["test_uuid"]))
    return {"deleted": args["test_uuid"], "editor_url": _coach_url(db, ctx, "/tests")}


async def run_coach_tests(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    """Start a run in the background; get_coach_test_run reports it."""
    _require_platform_admin(ctx)
    run, arguments = scenarios.begin(db, ctx.user)
    task = asyncio.create_task(scenarios.execute(**arguments))
    _running.add(task)
    task.add_done_callback(_running.discard)
    return {"run": scenarios.run_dict(run), "editor_url": _coach_url(db, ctx, "/tests")}


async def get_coach_test_run(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_platform_admin(ctx)
    return {"run": scenarios.get_run(db, str(args["run_uuid"])), "editor_url": _coach_url(db, ctx, "/tests")}


async def list_coach_shared_conversations(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    """Conversations learners chose to share with the coaching team, with a conversation test drafted from each."""
    _require_platform_admin(ctx)
    return {"shared": sharing.shared_view(db), "editor_url": _coach_url(db, ctx, "/tests")}


def _score(side: dict) -> str:
    return f"musts {side['must'][0]}/{side['must'][1]}, shoulds {side['should'][0]}/{side['should'][1]}"


def summary(name: str, result: dict) -> str | None:
    release = result.get("release") or {}
    pending = len(release.get("draft_changes") or [])
    waiting = f" The draft now has {pending} unreleased change{'s' if pending != 1 else ''}; a person releases it at {result.get('editor_url', '').replace('/knowledge', '')}/releases."
    if name == "save_coach_playbook":
        book = result["playbook"]
        return f"{'Added' if result['created'] else 'Saved'} playbook \"{book['title']}\" ({book['playbook_uuid']}) to the draft.{waiting}"
    if name == "delete_coach_playbook":
        return f"Deleted playbook {result['deleted']} from the draft.{waiting}"
    if name == "list_coach_shared_conversations":
        count = len(result["shared"])
        return f"{count} shared conversation{'s' if count != 1 else ''}. Each has a draft_test to finish (title, persona, rubric) and save with save_coach_test." if count else "No learner has shared a conversation yet."
    if name == "save_coach_test":
        test = result["test"]
        return f"{'Added' if result['created'] else 'Saved'} test \"{test['title']}\" ({test['test_uuid']}). Run it with run_coach_tests."
    if name == "delete_coach_test":
        return f"Deleted test {result['deleted']}."
    if name == "run_coach_tests":
        run = result["run"]
        return f"Started test run {run['run_uuid']} ({run['calls']} model calls). Check it with get_coach_test_run; results also show at {result['editor_url']}."
    if name == "get_coach_test_run":
        run = result["run"]
        if run["status"] == "running":
            return f"Still running: {run['done_calls']} of {run['calls']} model calls done."
        if run["status"] == "failed":
            return f"The run failed: {run['error']}"
        sides = run["summary"]
        lines = [f"Draft: {_score(sides['draft'])}."] if "draft" in sides else []
        if "live" in sides:
            lines.append(f"Live release {run['live_number']}: {_score(sides['live'])}.")
        failed = (sides.get("draft") or {}).get("failed_musts") or []
        lines += [f"Draft missed a must in \"{item['test']}\" ({item['passed']}/{item['total']}): {item['line']}" for item in failed]
        return "\n".join(lines) + "\n\nEach response and the judge's evidence are in the structured result."
    if name == "preview_coach_knowledge":
        return f"The draft gives Coach: {', '.join(result['playbooks']) or 'no playbooks'}.\n\n{result['knowledge']}"
    return None
