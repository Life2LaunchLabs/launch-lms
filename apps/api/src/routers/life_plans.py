"""Life plans: the learner's plan, the add-tray catalog, places, jobs and estimates.

Platform admins load facts from official files and review them under /life/admin.
"""

import asyncio
import logging
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.core.events.database import engine, get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.superadmin import require_superadmin
from src.services.life_plans import careers as career_service
from src.services.life_plans import catalog as catalog_service
from src.services.life_plans import datasets as dataset_service
from src.services.life_plans import estimates as estimate_service
from src.services.life_plans import importers
from src.services.life_plans import places as place_service
from src.services.life_plans import plans as plan_service
from src.services.life_plans import public_data

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


@router.get("/careers")
def api_careers(q: str = "", limit: int = 20, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Reviewed careers from O*NET, matched on their title and other titles."""
    return {"careers": public_data.search_careers(db, q, limit=min(max(limit, 1), 50))}


class CareerMatch(BaseModel):
    scores: dict[str, float] = Field(description="A score for each of R, I, A, S, E and C, on any scale.")
    job_zones: list[int] | None = None
    limit: int = Field(default=20, ge=1, le=50)


@router.post("/careers/match")
def api_match_careers(body: CareerMatch, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Careers whose RIASEC profile lines up with these interest scores, closest first."""
    try:
        careers = public_data.match_careers(db, {k.upper(): v for k, v in body.scores.items()}, job_zones=body.job_zones, limit=body.limit)
    except public_data.CatalogProblem as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"careers": careers, "method": "Correlation between your six interest scores and each career's O*NET interest profile; 1 means the same shape."}


def _signed_in(user) -> PublicUser:
    if not getattr(user, "id", None) or getattr(user, "user_uuid", "") == "user_anonymous":
        raise HTTPException(status_code=401, detail="Sign in to explore careers.")
    return user


@router.get("/careers/deck")
def api_career_deck(org_id: int, size: int = 10, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Career swipe's next careers: the organization's career resources the learner hasn't saved, closest to their
    interest quiz first, skipped ones pushed back."""
    return career_service.deck(db, _signed_in(user), org_id, size=min(max(size, 1), 10))


@router.get("/careers/links")
def api_career_links(org_id: int, codes: str = "", db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """The career resource to open for each O*NET-SOC code, where the organization has one."""
    wanted = [code.strip() for code in codes.split(",") if code.strip()][:100]
    return {"links": career_service.links(db, user, org_id, wanted)}


class HomeBase(BaseModel):
    label: str = Field(default="", max_length=120)
    reach: str = "state"
    online: bool = True


@router.get("/home")
def api_home_base(q: str | None = None, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """The learner's home base for Explore: the portfolio's location, where we place it, how far they'd go and
    whether online is OK. With `q`, where we'd place that text instead (a preview while typing)."""
    return career_service.home_settings(db, _signed_in(user).id, q[:120] if q is not None else None)


@router.put("/home")
def api_save_home_base(body: HomeBase, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Set the portfolio's location and the home base settings under it."""
    if body.reach not in career_service.REACHES:
        raise HTTPException(status_code=400, detail="Reach is close, region, state or anywhere.")
    return career_service.save_home(db, _signed_in(user), body.label, body.reach, body.online)


@router.get("/careers/{code}/profile")
def api_career_profile(code: str, org_id: int | None = None, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """A career's page: what it is, what people do, pay in Oregon and where the learner's phases are, training,
    how it lines up with their interest quiz, and similar careers. Every fact says where it came from."""
    found = career_service.profile(db, _signed_in(user), code, org_id)
    if not found:
        raise HTTPException(status_code=404, detail="No such career.")
    return found


@router.post("/careers/{code}/skip")
def api_career_skip(code: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Swiped past in Career swipe: it comes back later, after careers not seen yet."""
    if not career_service.CODE.fullmatch(code):
        raise HTTPException(status_code=400, detail="That isn't an O*NET-SOC code.")
    return career_service.skip(db, _signed_in(user), code)


@router.delete("/careers/{code}/skip")
def api_career_unskip(code: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return career_service.unskip(db, _signed_in(user), code)


@router.get("/careers/{code}")
def api_career(code: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    career = public_data.get_career(db, code)
    if not career:
        raise HTTPException(status_code=404, detail="No such career.")
    return {"career": career}


@router.get("/schools")
def api_schools(q: str = "", state: str | None = None, limit: int = 20, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Reviewed schools from the College Scorecard, matched on their name."""
    return {"schools": public_data.search_schools(db, q, state=state, limit=min(max(limit, 1), 50))}


@router.get("/schools/{unitid}")
def api_school(unitid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    school = public_data.get_school(db, unitid)
    if not school:
        raise HTTPException(status_code=404, detail="No such school.")
    return {"school": school}


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


@router.get("/admin/datasets")
def api_admin_datasets(db: Session = Depends(get_db_session), user: PublicUser = Depends(require_superadmin)):
    """The datasets we expect, each with its loaded releases (newest first) and their tables."""
    return {"datasets": dataset_service.catalog(db)}


def _dataset_filters(metric: str = "", level: str = "", status: str = "", job_zone: str = "", state: str = "", control: str = "") -> dict[str, str]:
    return {"metric": metric, "level": level, "status": status, "job_zone": job_zone, "state": state, "control": control}


@router.get("/admin/datasets/{source_key}/rows")
def api_admin_dataset_rows(
    source_key: str,
    table: str = "facts",
    q: str = "",
    page: int = 1,
    per_page: int = 50,
    filters: dict = Depends(_dataset_filters),
    db: Session = Depends(get_db_session),
    user: PublicUser = Depends(require_superadmin),
):
    """One page of a release's table (facts, careers or schools), searched and filtered."""
    try:
        return dataset_service.rows(db, source_key, table, q=q, filters=filters, page=page, per_page=per_page)
    except dataset_service.DatasetProblem as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/admin/datasets/{source_key}/export")
def api_admin_dataset_export(
    source_key: str,
    table: str = "facts",
    q: str = "",
    filters: dict = Depends(_dataset_filters),
    db: Session = Depends(get_db_session),
    user: PublicUser = Depends(require_superadmin),
):
    """The same rows as CSV, every page, with the same search and filters."""
    try:
        text = dataset_service.export_csv(db, source_key, table, q=q, filters=filters)
    except dataset_service.DatasetProblem as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    name = dataset_service.export_name(source_key, table)
    return Response(content=text, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}"'})


# Imports of big files (the OEWS workbook takes a minute or two to read) outlive the
# proxy's request timeout, so they run as jobs. One API process serves the app, so the
# job table lives in memory; a restart forgets running jobs, and the import is simply
# loaded again.
_IMPORT_JOBS: dict[str, dict] = {}
_IMPORT_WAIT_SECONDS = 20
_IMPORT_TASKS: set[asyncio.Task] = set()  # keeps running jobs from being garbage-collected


def _run_import(data: bytes, filename: str) -> dict:
    with Session(engine) as db:
        return importers.import_file(db, data, filename)


async def _import_job(job_id: str, data: bytes, filename: str) -> dict:
    job = _IMPORT_JOBS[job_id]
    try:
        job["result"] = await run_in_threadpool(_run_import, data, filename)
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
    file: UploadFile = File(...),
    user: PublicUser = Depends(require_superadmin),
):
    """Load an official file as draft facts or catalog entries. Only the allowed files
    load (HUD county Fair Market Rents, BLS OEWS all-data, the O*NET text database, the
    College Scorecard institution file); the source and release come from the file.

    Small files answer with the result. A file that takes longer than a few seconds
    answers 202 with a job id; poll GET /admin/import/{job} for the result."""
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="That file is too large.")
    job_id = uuid4().hex
    _IMPORT_JOBS[job_id] = {"id": job_id, "status": "running", "filename": file.filename or "", "started": datetime.now(UTC).isoformat()}
    task = asyncio.create_task(_import_job(job_id, data, file.filename or ""))
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
