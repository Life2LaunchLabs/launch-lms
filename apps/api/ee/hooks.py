import asyncio
import logging
from fastapi import FastAPI, APIRouter, Depends
from sqlmodel import Session
from src.core.events.database import engine
from src.security.auth import get_current_user
from src.security.api_token_utils import require_non_api_token_user
from src.security.features_utils.plan_check import require_plan
from ee.middleware.audit import EEAuditLogMiddleware
from ee.services.audit import flush_audit_logs_to_db
from ee.routers import cloud_internal
from ee.routers import payments
from ee.routers import scorm
from ee.routers import sso

logger = logging.getLogger(__name__)

# Helper dependency to reject API token access
async def get_non_api_token_user(user = Depends(get_current_user)):
    """Dependency that rejects API token access."""
    return await require_non_api_token_user(user)


def register_middlewares(app: FastAPI):
    """Register optional middleware integrations."""
    app.add_middleware(EEAuditLogMiddleware)
    logger.info("Optional middlewares registered")

def register_routers(v1_router: APIRouter):
    """Register optional routers."""
    # Cloud Internal
    v1_router.include_router(
        cloud_internal.router,
        prefix="/cloud_internal",
        tags=["cloud_internal"],
        dependencies=[Depends(cloud_internal.check_internal_cloud_key)],
    )
    
    # Payments
    v1_router.include_router(
        payments.router,
        prefix="/payments",
        tags=["payments"],
        dependencies=[Depends(require_plan("standard", "payments"))],
    )
    
    # SCORM
    v1_router.include_router(
        scorm.router,
        prefix="/scorm",
        tags=["scorm"],
        dependencies=[Depends(get_non_api_token_user)]
    )

    # SSO - Admin endpoints require authentication, auth endpoints are public
    v1_router.include_router(
        sso.router,
        prefix="/auth/sso",
        tags=["sso", "auth"],
    )

    logger.info("Optional routers registered")

def on_startup(app: FastAPI):
    """Run Enterprise Edition startup tasks."""
    
    # Start Audit Log Flusher
    async def audit_log_flusher():
        while True:
            await asyncio.sleep(60)  # Flush every minute
            try:
                with Session(engine) as session:
                    flush_audit_logs_to_db(session)
            except Exception as e:
                logger.error(f"EE Audit log flusher error: {e}")

    asyncio.create_task(audit_log_flusher())
    logger.info("EE Startup tasks initiated")

# Payments hooks
async def check_activity_paid_access(request, activity_id, user, db_session) -> bool:
    """Check if a user has paid access to an activity."""
    from ee.services.payments.payments_access import check_activity_paid_access as ee_check_activity_paid_access
    return await ee_check_activity_paid_access(request, activity_id, user, db_session)
