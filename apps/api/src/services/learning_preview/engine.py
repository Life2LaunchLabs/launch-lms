"""Side-effect-free activity runtime used by every preview surface.

It grades answers, extracts variables, routes the branching flow and checks
completion with the same functions the live runtime uses, but on in-memory
pages and a client-held state object. Nothing is written: no runs, attempts,
progress, profile variables or portfolio outcomes. The response mirrors the
live run payload (attempts, navigation, render_context) so the learner player
renders preview and live runs identically.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from src.db.learning import LearningActivity, LearningPage, LearningPageType
from src.services import learning
from src.services.learning_flow import resolve_flow

PREVIEW_ACTIVITY_ID = -1
DEFAULT_PERSONA = {
    "user.first_name": "Alex",
    "user.last_name": "Rivera",
    "user.username": "alex.preview",
}


def activity_view(document: dict) -> dict:
    """The activity in the shape the learner player expects (LearningActivityRead)."""
    meta = document["activity"]
    return {
        "id": PREVIEW_ACTIVITY_ID,
        "activity_uuid": meta.get("activity_uuid") or "learning_activity_preview",
        "title": meta["title"],
        "description": meta.get("description") or "",
        "icon": meta.get("icon"),
        "thumbnail_image": meta.get("thumbnail_image") or "",
        "required": meta.get("required", True),
        "settings": meta.get("settings") or {},
        "pages": [
            {**page, "order": index, "id": -index}
            for index, page in enumerate(document["pages"], start=1)
        ],
    }


def _pages(document: dict) -> list[LearningPage]:
    return [
        LearningPage(
            id=-index,
            activity_id=PREVIEW_ACTIVITY_ID,
            badge_id=0,
            org_id=0,
            page_uuid=page["page_uuid"],
            page_type=LearningPageType(page.get("page_type") or "standard"),
            title=page["title"],
            order=index,
            required=page.get("required", True),
            content=page.get("content") or {},
            design=page.get("design") or {},
            scoring={},
            completion={},
        )
        for index, page in enumerate(document["pages"], start=1)
    ]


def initial_state(persona: dict | None = None) -> dict:
    return {
        "attempts": [],
        "completed": [],
        "variables": {**DEFAULT_PERSONA, **(persona or {})},
        "facts": {"has_project": False, "has_timeline": False, "project_count": 0, "timeline_count": 0, "readiness_blockers": []},
        "status": "in_progress",
        "result": None,
    }


def _normalize(state: dict | None) -> dict:
    base = initial_state()
    if not isinstance(state, dict):
        return base
    for key, value in state.items():
        if key in base and isinstance(value, type(base[key])):
            base[key] = value
    if isinstance(state.get("result"), dict):
        base["result"] = state["result"]
    return base


def _answers(state: dict) -> dict:
    answers: dict[str, dict] = {}
    for attempt in state["attempts"]:
        answers[attempt["page_uuid"]] = {"answer": attempt.get("answer") or {}, "result": attempt.get("result") or {}}
    return answers


def _route(document: dict, state: dict):
    flow = (document["activity"].get("settings") or {}).get("flow")
    if not flow:
        return [page["page_uuid"] for page in document["pages"]], True, []
    resolved = resolve_flow(
        flow,
        {
            "answers": _answers(state),
            "variables": state["variables"],
            "facts": state["facts"],
            "context": {"mode": "create", "bindings": {}},
            "bindings": {},
        },
    )
    return list(resolved.page_uuids), bool(resolved.terminal), resolved.trace


def _score(pages: list[LearningPage], state: dict, activity: LearningActivity) -> dict:
    latest = {attempt["page_uuid"]: attempt for attempt in state["attempts"]}
    earned = possible = 0.0
    pending = 0
    for page in pages:
        questions = learning._question_blocks(page)
        points = sum(learning._question_block_points(page, question) for question in questions)
        if not questions or points <= 0:
            continue
        possible += points
        attempt = latest.get(page.page_uuid)
        if not attempt:
            continue
        if (attempt.get("result") or {}).get("grading_status") == "pending":
            pending += 1
            continue
        earned += learning._as_float(attempt.get("score"), 0.0)
    grading = learning._activity_grading_settings(activity)
    percent = round((earned / possible) * 100, 1) if possible > 0 else 100.0
    passed = pending == 0 and (possible <= 0 or percent >= grading["minimum_score_percent"])
    return {
        "score": earned,
        "max_score": possible,
        "score_percent": percent,
        "pending_manual_grades": pending,
        "passed": passed,
        "grading": {**grading, "mode": "pass_fail" if possible > 0 else "completion"},
    }


def _complete(document: dict, pages: list[LearningPage], state: dict, page_uuid: str) -> dict:
    if page_uuid not in state["completed"]:
        state["completed"].append(page_uuid)
    path, terminal, _trace = _route(document, state)
    reachable = set(path)
    # Match the live runtime: progress on pages the route no longer visits is dropped.
    state["completed"] = [uuid for uuid in state["completed"] if uuid in reachable]
    required = [page.page_uuid for page in pages if page.required and page.page_uuid in reachable]
    if terminal and required and all(uuid in state["completed"] for uuid in required):
        meta = document["activity"]
        activity = LearningActivity(title=meta["title"], path_id=0, badge_id=0, org_id=0, settings=meta.get("settings") or {})
        state["result"] = _score(pages, state, activity)
        state["status"] = "completed" if state["result"]["passed"] else "in_progress"
    return state


def run_view(document: dict, state: dict) -> dict:
    path, terminal, trace = _route(document, state)
    current = next((uuid for uuid in path if uuid not in state["completed"]), None)
    return {
        "id": 0,
        "run_uuid": "learning_run_preview",
        "status": state["status"],
        "preview": True,
        "attempts": state["attempts"],
        "page_progress": [{"page_uuid": uuid, "complete": True, "data": {}} for uuid in state["completed"]],
        "navigation": {
            "activities": [
                {
                    "activity_id": PREVIEW_ACTIVITY_ID,
                    "path": path,
                    "current_page_uuid": current,
                    "terminal_reachable": terminal,
                    "condition_trace": trace,
                    "completed": len([uuid for uuid in path if uuid in state["completed"]]),
                    "total": len(path),
                }
            ]
        },
        "render_context": {"answers": _answers(state), "variables": state["variables"]},
        "result": state["result"],
    }


def step(document: dict, state: dict | None, action: str, page_uuid: str, answer: dict | None = None) -> dict:
    """Apply one learner action and return ``{"run": …, "state": …}``.

    Raises ``HTTPException`` (422) for answers the live runtime would reject.
    """
    state = _normalize(state)
    pages = _pages(document)
    page = next((item for item in pages if item.page_uuid == page_uuid), None)
    if page is None:
        raise HTTPException(status_code=404, detail="Page is not part of this preview")
    if action == "submit":
        is_correct, score, feedback_key, result = learning._grade_answer(page, answer or {})
        variables = learning._extract_learning_variables(page, result)
        for variable in variables:
            target = str(variable.get("target") or "")
            if target:
                state["variables"][target] = variable.get("value")
        if variables:
            result = {**result, "variables": variables, "variables_applied": [], "preview": True}
        state["attempts"] = [item for item in state["attempts"] if item["page_uuid"] != page_uuid] + [
            {
                "attempt_uuid": f"learning_attempt_preview_{len(state['attempts']) + 1}",
                "page_uuid": page_uuid,
                "answer": answer or {},
                "is_correct": is_correct,
                "score": score,
                "feedback_key": feedback_key,
                "result": result,
                "submitted_at": datetime.now(timezone.utc).isoformat(),
            }
        ]
    elif action != "complete":
        raise HTTPException(status_code=422, detail="Unknown preview action")
    state = _complete(document, pages, state, page_uuid)
    return {"run": run_view(document, state), "state": state}


def start(document: dict, persona: dict | None = None) -> dict:
    state = initial_state(persona)
    return {"activity": activity_view(document), "run": run_view(document, state), "state": state}
