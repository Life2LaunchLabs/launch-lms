from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from src.core.events.database import get_db_session
from src.services.health.health import check_health, deploy_ready
from src.services.utils.storage import check_storage

router = APIRouter()

@router.get("")
async def health(db_session: Session = Depends(get_db_session)):
    return await check_health(db_session)


@router.get("/storage")
def storage_health():
    """Whether uploads can be stored: writes, reads back and removes a small file."""
    result = check_storage()
    if not result["ok"]:
        raise HTTPException(status_code=503, detail=result)
    return result


@router.get("/deploy-ready")
def deploy_ready_check(db_session: Session = Depends(get_db_session)):
    """Whether this site is fine to redeploy now, and if not, why. The site decides; unstable's
    deploy (infra) asks this from the host and waits while it says no."""
    return deploy_ready(db_session)
