"""Life plans: the learner's plan, the add-tray catalog, places, jobs and estimates.

Platform admins load facts from official files and review them under /life/admin.
"""

import asyncio
import logging
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.core.events.database import engine, get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.superadmin import require_superadmin
from src.services.life_plans import catalog as catalog_service
from src.services.life_plans import estimates as estimate_service
from src.services.life_plans import importers
from src.services.life_plans import places as place_service
from src.services.life_plans import plans as plan_service

router = APIRouter()

MAX_UPLOAD = 200 * 1024 * 1024  # the OEWS all-data zip is ~80 MB, its workbook ~82 MB


class EstimateBatch(BaseModel):
    queries: list[estimate_service.EstimateQuery] = Field(default_factory=list, max_length=300)


@router.get("/plan")
def api_get_plan(db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """The learner's life plan, or null before they start one."""
    return {"plan": plan_service.get_plan(db, user)}


@router.get("/shared")
def api_shared_plans(db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Who shared their plans with this person."""
    return {"people": plan_service.shared_plans(db, user)}


@router.get("/shared/{user_uuid}")
def api_shared_plan(user_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Someone's life plan, budget included, read-only, when they shared their plans with this person."""
    return plan_service.shared_plan(db, user, user_uuid)


@router.put("/plan")
def api_save_plan(body: plan_service.SavePlan, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Save the whole plan document. A stale revision is refused with 409."""
    return {"plan": plan_service.save_plan(db, user, body)}


@router.put("/plan/goals")
def api_place_goal(body: plan_service.PlaceGoal, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Move one of the learner's goals into a phase, without sending the whole plan."""
    return {"plan": plan_service.place_goal(db, user, body)}


@router.delete("/plan", status_code=204)
def api_delete_plan(db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    plan_service.delete_plan(db, user)
    return Response(status_code=204)


@router.get("/catalog")
def api_catalog(user: PublicUser = Depends(get_current_user)):
    """Categories and ready-made items for the Add tray."""
    return catalog_service.catalog()


@router.get("/places")
def api_places(q: str = "", user: PublicUser = Depends(get_current_user)):
    return {"places": place_service.search(q, limit=15)}


@router.get("/occupations")
def api_occupations(q: str = "", db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Jobs we have reviewed pay figures for."""
    return {"occupations": estimate_service.occupations(db, q)}


@router.get("/metrics")
def api_available_metrics(place: str | None = None, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Which metrics we have reviewed facts for at this place (or one it sits in)."""
    return {"metrics": estimate_service.available_metrics(db, place)}


@router.post("/estimates")
def api_estimates(body: EstimateBatch, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """The most specific reviewed fact for each line, or null where we have none."""
    return {"estimates": estimate_service.resolve_many(db, body.queries)}


@router.get("/admin/sources")
def api_admin_sources(db: Session = Depends(get_db_session), user: PublicUser = Depends(require_superadmin)):
    return {"sources": estimate_service.coverage(db)}


# Imports of big files (the OEWS workbook takes a minute or two to read) outlive the
# proxy's request timeout, so they run as jobs. One API process serves the app, so the
# job table lives in memory; a restart forgets running jobs, and the import is simply
# loaded again.
_IMPORT_JOBS: dict[str, dict] = {}
_IMPORT_WAIT_SECONDS = 20
_IMPORT_TASKS: set[asyncio.Task] = set()  # keeps running jobs from being garbage-collected


def _run_import(kind: str, data: bytes, filename: str, year: int, url: str) -> dict:
    with Session(engine) as db:
        if kind == "hud_fmr":
            return importers.import_hud_fmr(db, data, filename, fiscal_year=year, url=url)
        return importers.import_bls_oews(db, data, filename, year=year, url=url)


async def _import_job(job_id: str, kind: str, data: bytes, filename: str, year: int, url: str) -> dict:
    job = _IMPORT_JOBS[job_id]
    try:
        job["result"] = await run_in_threadpool(_run_import, kind, data, filename, year, url)
        job["status"] = "done"
    except importers.ImportProblem as exc:
        job["status"], job["error"] = "failed", str(exc)
    except Exception:  # noqa: BLE001 - report any failure to the person who started it
        logging.exception("Life plans import %s failed", job_id)
        job["status"], job["error"] = "failed", "The file could not be loaded. Check the server log."
    return job


def _job_response(job: dict, response: Response | None = None) -> dict:
    if job["status"] == "failed":
        raise HTTPException(status_code=400, detail=job["error"])
    if job["status"] == "running" and response is not None:
        response.status_code = 202
    return {"job": job["id"], "status": job["status"], **(job.get("result") or {})}


@router.post("/admin/import")
async def api_admin_import(
    response: Response,
    kind: str = Form(...),
    year: int = Form(..., ge=2000, le=2100),
    url: str = Form(..., max_length=500),
    file: UploadFile = File(...),
    user: PublicUser = Depends(require_superadmin),
):
    """Load an official file as draft facts: kind `hud_fmr` or `bls_oews`.

    Small files answer with the result. A file that takes longer than a few seconds
    answers 202 with a job id; poll GET /admin/import/{job} for the result."""
    if kind not in ("hud_fmr", "bls_oews"):
        raise HTTPException(status_code=400, detail="Unknown kind.")
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="That file is too large.")
    job_id = uuid4().hex
    _IMPORT_JOBS[job_id] = {"id": job_id, "status": "running", "kind": kind, "filename": file.filename or "", "started": datetime.now(UTC).isoformat()}
    task = asyncio.create_task(_import_job(job_id, kind, data, file.filename or "", year, url))
    _IMPORT_TASKS.add(task)
    task.add_done_callback(_IMPORT_TASKS.discard)
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=_IMPORT_WAIT_SECONDS)
    except TimeoutError:
        pass
    return _job_response(_IMPORT_JOBS[job_id], response)



@router.get("/admin/import/{job_id}")
def api_admin_import_status(job_id: str, response: Response, user: PublicUser = Depends(require_superadmin)):
    """The state of an import job: running, done (with the result) or failed."""
    job = _IMPORT_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="No such import. If the server restarted, load the file again.")
    return _job_response(job, response)


class ReviewBody(BaseModel):
    status: str = Field(default="reviewed", pattern="^(reviewed|draft|retired)$")


@router.post("/admin/sources/{source_key}/review")
def api_admin_review(source_key: str, body: ReviewBody, db: Session = Depends(get_db_session), user: PublicUser = Depends(require_superadmin)):
    """Mark every fact from a source reviewed (or back to draft, or retired)."""
    try:
        return {"facts": importers.review_source(db, source_key, user.id, body.status)}
    except importers.ImportProblem as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
