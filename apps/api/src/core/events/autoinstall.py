import logging

from cli import install
from config.config import get_launchlms_config
from sqlalchemy import create_engine, inspect
from sqlmodel import Session, select
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.services.orgs.owner import owner_org

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

    def ensure_owner_org_is_enterprise() -> None:
        org = owner_org(db_session)
        if not org:
            return

        owner_org_config = db_session.exec(
            select(OrganizationConfig).where(OrganizationConfig.org_id == org.id)
        ).first()
        if not owner_org_config:
            return

        config = dict(owner_org_config.config or {})
        if config.get("tier") != "enterprise":
            config["tier"] = "enterprise"
            owner_org_config.config = config
            db_session.add(owner_org_config)
            db_session.commit()
            logger.info("Updated owner organization '%s' tier to enterprise", org.slug)

    if len(orgs) == 0:
        logger.info("No organizations found. Starting auto-installation 🏗️")
        install(short=True)
        ensure_owner_org_is_enterprise()
        return

    if orgs:
        if not owner_org(db_session):
            logger.info("No owner organization found. Starting auto-installation 🏗️")
            install(short=True)
            ensure_owner_org_is_enterprise()
            return

        ensure_owner_org_is_enterprise()

            
            
