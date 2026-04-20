import logging
from sqlalchemy import create_engine
from sqlmodel import SQLModel, Session, select

from cli import install
from config.config import get_launchlms_config
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization

logger = logging.getLogger(__name__)


def auto_install():
    # Get the database session
    launchlms_config = get_launchlms_config()
    engine = create_engine(
        launchlms_config.database_config.sql_connection_string, echo=False, pool_pre_ping=True  # type: ignore
    )
    SQLModel.metadata.create_all(engine)

    db_session = Session(engine)

    orgs = db_session.exec(select(Organization)).all()

    def ensure_owner_org_is_master() -> None:
        owner_org = db_session.exec(
            select(Organization).order_by(Organization.id).limit(1)
        ).first()
        if not owner_org:
            return

        owner_org_config = db_session.exec(
            select(OrganizationConfig).where(OrganizationConfig.org_id == owner_org.id)
        ).first()
        if not owner_org_config:
            return

        config = owner_org_config.config or {}
        version = str(config.get("config_version", "1.0"))

        if version.startswith("2"):
            current_plan = config.get("plan", "free")
            if current_plan != "master":
                config["plan"] = "master"
                owner_org_config.config = config
                db_session.add(owner_org_config)
                db_session.commit()
                logger.info("Updated owner organization '%s' plan to master", owner_org.slug)
        else:
            cloud = config.setdefault("cloud", {})
            current_plan = cloud.get("plan", "free")
            if current_plan != "master":
                cloud["plan"] = "master"
                owner_org_config.config = config
                db_session.add(owner_org_config)
                db_session.commit()
                logger.info("Updated legacy owner organization '%s' plan to master", owner_org.slug)

    if len(orgs) == 0:
        logger.info("No organizations found. Starting auto-installation 🏗️")
        install(short=True)
        ensure_owner_org_is_master()
        return

    if orgs:
        owner_org = db_session.exec(select(Organization).order_by(Organization.id).limit(1)).first()
        if not owner_org:
            logger.info("No owner organization found. Starting auto-installation 🏗️")
            install(short=True)
            ensure_owner_org_is_master()
            return

        default_org = db_session.exec(select(Organization).where(Organization.slug == 'default')).first()
        if not default_org:
            logger.info("No 'default' slug organization found. Skipping default-slug bootstrap and reconciling owner org")

        ensure_owner_org_is_master()

            
            
