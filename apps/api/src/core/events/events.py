import logging
from typing import Callable
from fastapi import FastAPI
from config.config import LaunchLMSConfig, get_launchlms_config
from src.core.events.autoinstall import auto_install
from src.core.events.content import check_content_directory
from src.core.events.database import close_database, connect_to_db
from src.core.events.logs import create_logs_dir

logger = logging.getLogger(__name__)


def _reconcile_packs():
    """Reconcile Redis pack credits with DB state on startup."""
    try:
        from sqlalchemy import create_engine
        from sqlmodel import Session
        launchlms_config = get_launchlms_config()
        engine = create_engine(
            launchlms_config.database_config.sql_connection_string,
            echo=False,
            pool_pre_ping=True,
        )
        db_session = Session(engine)
        try:
            from src.services.packs.packs import reconcile_pack_credits
            result = reconcile_pack_credits(db_session)
            logger.info("Pack reconciliation on startup: %s", result)
        finally:
            db_session.close()
    except Exception as e:
        logger.warning("Pack reconciliation skipped (non-fatal): %s", e)


def startup_app(app: FastAPI) -> Callable:
    async def start_app() -> None:
        # Get Launch LMS Config
        launchlms_config: LaunchLMSConfig = get_launchlms_config()
        app.launchlms_config = launchlms_config  # type: ignore

        # Connect to database
        await connect_to_db(app)

        # Create logs directory
        await create_logs_dir()

        # Create content directory
        await check_content_directory()

        # Check if auto-installation is needed
        auto_install()

        # Reconcile pack credits (Redis ↔ DB)
        _reconcile_packs()

        # Former EE startup work has either been folded into core startup
        # or intentionally disabled until a native rebuild lands.

    return start_app


def shutdown_app(app: FastAPI) -> Callable:
    async def close_app() -> None:
        await close_database(app)

    return close_app
