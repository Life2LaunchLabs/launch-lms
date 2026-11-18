"""Staff bringing a school's Oregon CIS work over (services/portfolio_import_bulk.py reads, portfolio_held_imports.py sends)."""

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.org_auth import require_org_admin
from src.services import portfolio_held_imports as held, portfolio_import_bulk as bulk
from src.services.portfolio_import_sources import MAX_UPLOAD

router = APIRouter()


async def _content(upload: UploadFile) -> bytes:
    content = await upload.read()
    if not content:
        raise HTTPException(status_code=400, detail="No file provided")
    if len(content) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="This export is too big to bring in")
    return content


@router.post("/{org_id}/cis-imports/preview")
async def api_preview_cis_export(org_id: int, file: UploadFile = File(...), current_user: PublicUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    """Each learner in a CIS bulk export or single download and what would come over for them. Saves nothing."""
    require_org_admin(current_user.id, org_id, db, "manage_learners")
    return bulk.preview(await _content(file), file.filename or "export")


@router.post("/{org_id}/cis-imports")
async def api_send_cis_invitations(
    request: Request, org_id: int, file: UploadFile = File(...), learners: str = Form("[]"), note: str = Form(""), usergroup_id: int | None = Form(None),
    current_user: PublicUser = Depends(get_current_user), db: Session = Depends(get_db_session),
):
    """Invite each picked learner ``[{key, email}]`` from the export, holding their CIS work until they accept."""
    try:
        picks = json.loads(learners)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="learners must be a JSON list") from error
    if not isinstance(picks, list) or not all(isinstance(pick, dict) for pick in picks):
        raise HTTPException(status_code=422, detail="learners must be a JSON list")
    return await held.send(request, org_id, await _content(file), file.filename or "export", picks, note.strip()[:1000], usergroup_id, current_user, db)


@router.get("/{org_id}/cis-imports")
def api_list_cis_invitations(org_id: int, current_user: PublicUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    return held.sent_list(org_id, current_user, db)


@router.delete("/{org_id}/cis-imports/{held_uuid}")
def api_withdraw_cis_work(org_id: int, held_uuid: str, current_user: PublicUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    return held.withdraw(org_id, held_uuid, current_user, db)
