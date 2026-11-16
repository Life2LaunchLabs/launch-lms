"""Staff bringing a school's Oregon CIS work over (see services/portfolio_import_bulk.py)."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.org_auth import require_org_admin
from src.services import portfolio_import_bulk as bulk
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
