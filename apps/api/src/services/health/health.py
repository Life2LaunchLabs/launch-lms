from fastapi import HTTPException
from sqlalchemy import text
from sqlmodel import Session


async def check_database_health(db_session: Session) -> bool:
    result = db_session.exec(text("SELECT 1"))

    if not result:
        return False

    return True

async def check_health(db_session: Session) -> bool:
    # Check database health
    database_healthy = await check_database_health(db_session)

    if not database_healthy:
        raise HTTPException(status_code=503, detail="Database is not healthy")

    return True


def deploy_ready(db_session: Session) -> dict:
    """Whether a redeploy now would cut something off, with the reasons. New blockers go here."""
    from src.services.user_tests.settings import enabled as user_tests_enabled

    reasons: list[dict] = []
    if user_tests_enabled():
        from src.services.user_tests.cohorts import deploy_blockers

        reasons += deploy_blockers(db_session)
    return {"ready": not reasons, "reasons": reasons}
