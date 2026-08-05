from fastapi import APIRouter, Depends
from sqlmodel import Session
from src.core.events.database import get_db_session
from src.services.health.health import check_health

router = APIRouter()

@router.get("")
async def health(db_session: Session = Depends(get_db_session)):
    return await check_health(db_session)