import logging
from sqlalchemy import create_engine, inspect
from sqlmodel import SQLModel, Session, select

from cli import install
from config.config import get_launchlms_config
from src.db.organizations import Organization

logger = logging.getLogger(__name__)


def auto_install():
    # Get the database session
    launchlms_config = get_launchlms_config()
    engine = create_engine(
        launchlms_config.database_config.sql_connection_string, echo=False, pool_pre_ping=True  # type: ignore
    )

    with engine.connect() as connection:
        inspector = inspect(connection)
        if "organization" not in inspector.get_table_names():
            logger.info("Auto-install skipped: database schema is not initialized yet.")
            return

    db_session = Session(engine)

    orgs = db_session.exec(select(Organization)).all()

    if len(orgs) == 0:
        logger.info("No organizations found. Starting auto-installation 🏗️")
        install(short=True)

    if orgs: 
        for org in orgs:
            default_org = db_session.exec(select(Organization).where(Organization.slug == 'default')).first()

            if not default_org:
                logger.info("No default organization found. Starting auto-installation 🏗️")
                install(short=True)

    else: 
        logger.info("Organizations found. Skipping auto-installation 🚀")

            
            
