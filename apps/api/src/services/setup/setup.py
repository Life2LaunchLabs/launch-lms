import logging
from datetime import datetime
import json
from pathlib import Path
from uuid import uuid4
import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException
from sqlmodel import Session, select
from config.config import get_launchlms_config
from src.db.organization_config import (
    OrganizationConfig,
    OrganizationConfigV2Base,
)
from src.db.organizations import Organization, OrganizationCreate
from src.db.roles import DashboardPermission, Permission, PermissionsWithOwn, Rights, Role, RoleTypeEnum
from src.db.user_organizations import UserOrganization
from src.db.users import User, UserCreate, UserRead
from src.security.security import security_hash_password
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.services.utils.upload_content import ensure_directory_exists


DEFAULT_ORG_BRANDING_DIR = Path(__file__).resolve().parents[5] / "branding"
DEFAULT_ORG_BRANDING_ASSETS = {
    "logo": ("logos", "logo", "Galaxy Launchpad Logo Half dome.png"),
    "thumbnail": ("thumbnails", "thumbnail", "l2l on blue.png"),
    "favicon": ("favicons", "favicon", "Galaxy Launchpad Logo Bug.png"),
    "auth_background": ("auth_backgrounds", "auth_bg", "stacked-waves-haikei (1).png"),
    "og_image": ("og_images", "og", "l2l on blue.png"),
}


def _store_org_asset_from_branding(org_uuid: str, directory: str, filename_prefix: str, source_name: str) -> str:
    source_path = DEFAULT_ORG_BRANDING_DIR / source_name
    if not source_path.exists():
        logging.warning("Default branding asset not found: %s", source_path)
        return ""

    launchlms_config = get_launchlms_config()
    filename = f"{uuid4()}_{filename_prefix}{source_path.suffix.lower()}"
    local_path = Path("content") / "orgs" / org_uuid / directory / filename
    ensure_directory_exists(str(local_path.parent))

    if launchlms_config.hosting_config.content_delivery.type == "filesystem":
        local_path.write_bytes(source_path.read_bytes())
        return filename

    if launchlms_config.hosting_config.content_delivery.type == "s3api":
        content = source_path.read_bytes()
        local_path.write_bytes(content)

        s3 = boto3.client(
            "s3",
            endpoint_url=launchlms_config.hosting_config.content_delivery.s3api.endpoint_url,
        )
        bucket_name = (
            launchlms_config.hosting_config.content_delivery.s3api.bucket_name
            or "launch-lms-media"
        )

        try:
            s3.upload_file(str(local_path), bucket_name, str(local_path))
            s3.head_object(Bucket=bucket_name, Key=str(local_path))
        except ClientError as exc:
            logging.error("Failed to upload default org branding asset to S3: %s", exc)
            raise HTTPException(status_code=500, detail="Failed to upload default org branding asset")
        finally:
            try:
                local_path.unlink()
            except OSError:
                pass

        return filename

    logging.warning(
        "Unsupported content delivery type for default org branding: %s",
        launchlms_config.hosting_config.content_delivery.type,
    )
    return ""


def _apply_default_org_branding(org: Organization, org_settings: OrganizationConfig, db_session: Session) -> None:
    logo_filename = _store_org_asset_from_branding(
        org.org_uuid,
        *DEFAULT_ORG_BRANDING_ASSETS["logo"],
    )
    thumbnail_filename = _store_org_asset_from_branding(
        org.org_uuid,
        *DEFAULT_ORG_BRANDING_ASSETS["thumbnail"],
    )
    favicon_filename = _store_org_asset_from_branding(
        org.org_uuid,
        *DEFAULT_ORG_BRANDING_ASSETS["favicon"],
    )
    auth_background_filename = _store_org_asset_from_branding(
        org.org_uuid,
        *DEFAULT_ORG_BRANDING_ASSETS["auth_background"],
    )
    og_image_filename = _store_org_asset_from_branding(
        org.org_uuid,
        *DEFAULT_ORG_BRANDING_ASSETS["og_image"],
    )

    org.logo_image = logo_filename or org.logo_image
    org.thumbnail_image = thumbnail_filename or org.thumbnail_image
    org.socials = {
        **(org.socials or {}),
        "youtube": "@Life2Launch",
        "instagram": "https://www.instagram.com/life2launch/",
    }
    org.update_date = str(datetime.now())

    updated_config = dict(org_settings.config or {})
    customization = updated_config.setdefault("customization", {})
    general = customization.setdefault("general", {})
    seo = customization.setdefault("seo", {})

    general["color"] = "#081588"
    general["favicon_image"] = favicon_filename
    auth_branding = customization.setdefault("auth_branding", {})
    auth_branding["background_type"] = "custom"
    auth_branding["background_image"] = auth_background_filename
    auth_branding["text_color"] = "light"
    seo["default_og_image"] = og_image_filename

    org_settings.config = updated_config
    org_settings.update_date = str(datetime.now())

    db_session.add(org)
    db_session.add(org_settings)
    db_session.commit()
    db_session.refresh(org)
    db_session.refresh(org_settings)


# Install Default roles
def install_default_elements(db_session: Session):
    """Upsert global default roles. Existing roles are updated in place to
    preserve FK references from userorganization."""

    logger = logging.getLogger(__name__)

    # Build the desired role definitions
    role_global_admin = Role(
        name="Admin",
        description="Full platform control",
        id=1,
        role_type=RoleTypeEnum.TYPE_GLOBAL,
        role_uuid="role_global_admin",
        rights=Rights(
            courses=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=True,
                action_update_own=True,
                action_delete=True,
                action_delete_own=True,
            ),
            users=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            usergroups=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            collections=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            organizations=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            coursechapters=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            activities=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            roles=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            dashboard=DashboardPermission(
                action_access=True,
            ),
            communities=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            discussions=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=True,
                action_update_own=True,
                action_delete=True,
                action_delete_own=True,
            ),
            podcasts=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=True,
                action_update_own=True,
                action_delete=True,
                action_delete_own=True,
            ),
            boards=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=True,
                action_update_own=True,
                action_delete=True,
                action_delete_own=True,
            ),
        ),
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    role_global_maintainer = Role(
        name="Maintainer",
        description="Mid-level manager, wide permissions but no platform control",
        id=2,
        role_type=RoleTypeEnum.TYPE_GLOBAL,
        role_uuid="role_global_maintainer",
        rights=Rights(
            courses=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=True,
                action_update_own=True,
                action_delete=True,
                action_delete_own=True,
            ),
            users=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=False,
            ),
            usergroups=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            collections=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            organizations=Permission(
                action_create=False,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            coursechapters=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            activities=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            roles=Permission(
                action_create=False,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            dashboard=DashboardPermission(
                action_access=True,
            ),
            communities=Permission(
                action_create=True,
                action_read=True,
                action_update=True,
                action_delete=True,
            ),
            discussions=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=True,
                action_update_own=True,
                action_delete=True,
                action_delete_own=True,
            ),
            podcasts=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=True,
                action_update_own=True,
                action_delete=True,
                action_delete_own=True,
            ),
            boards=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=True,
                action_update_own=True,
                action_delete=True,
                action_delete_own=True,
            ),
        ),
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    role_global_instructor = Role(
        name="Instructor",
        description="Can manage their own content",
        id=3,
        role_type=RoleTypeEnum.TYPE_GLOBAL,
        role_uuid="role_global_instructor",
        rights=Rights(
            courses=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=False,
                action_update_own=True,
                action_delete=False,
                action_delete_own=True,
            ),
            users=Permission(
                action_create=False,
                action_read=False,
                action_update=False,
                action_delete=False,
            ),
            usergroups=Permission(
                action_create=False,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            collections=Permission(
                action_create=True,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            organizations=Permission(
                action_create=False,
                action_read=False,
                action_update=False,
                action_delete=False,
            ),
            coursechapters=Permission(
                action_create=True,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            activities=Permission(
                action_create=True,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            roles=Permission(
                action_create=False,
                action_read=False,
                action_update=False,
                action_delete=False,
            ),
            dashboard=DashboardPermission(
                action_access=True,
            ),
            communities=Permission(
                action_create=False,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            discussions=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=False,
                action_update_own=True,
                action_delete=False,
                action_delete_own=True,
            ),
            podcasts=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=False,
                action_update_own=True,
                action_delete=False,
                action_delete_own=True,
            ),
            boards=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=False,
                action_update_own=True,
                action_delete=False,
                action_delete_own=True,
            ),
        ),
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    role_global_user = Role(
        name="User",
        description="Read-Only Learner",
        role_type=RoleTypeEnum.TYPE_GLOBAL,
        role_uuid="role_global_user",
        id=4,
        rights=Rights(
            courses=PermissionsWithOwn(
                action_create=False,
                action_read=True,
                action_read_own=True,
                action_update=False,
                action_update_own=False,
                action_delete=True,
                action_delete_own=True,
            ),
            users=Permission(
                action_create=False,
                action_read=False,
                action_update=False,
                action_delete=False,
            ),
            usergroups=Permission(
                action_create=False,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            collections=Permission(
                action_create=False,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            organizations=Permission(
                action_create=False,
                action_read=False,
                action_update=False,
                action_delete=False,
            ),
            coursechapters=Permission(
                action_create=False,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            activities=Permission(
                action_create=False,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            roles=Permission(
                action_create=False,
                action_read=False,
                action_update=False,
                action_delete=False,
            ),
            dashboard=DashboardPermission(
                action_access=False,
            ),
            communities=Permission(
                action_create=False,
                action_read=True,
                action_update=False,
                action_delete=False,
            ),
            discussions=PermissionsWithOwn(
                action_create=True,
                action_read=True,
                action_read_own=True,
                action_update=False,
                action_update_own=True,
                action_delete=False,
                action_delete_own=True,
            ),
            podcasts=PermissionsWithOwn(
                action_create=False,
                action_read=True,
                action_read_own=True,
                action_update=False,
                action_update_own=False,
                action_delete=False,
                action_delete_own=False,
            ),
            boards=PermissionsWithOwn(
                action_create=False,
                action_read=True,
                action_read_own=True,
                action_update=False,
                action_update_own=False,
                action_delete=False,
                action_delete_own=False,
            ),
        ),
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    # Serialize rights to JSON
    desired_roles = [role_global_admin, role_global_maintainer, role_global_instructor, role_global_user]
    for role in desired_roles:
        role.rights = role.rights.model_dump()  # type: ignore

    # Upsert: update existing roles in place, create missing ones
    for desired in desired_roles:
        existing = db_session.get(Role, desired.id)
        if existing:
            existing.name = desired.name
            existing.description = desired.description
            existing.role_type = desired.role_type
            existing.role_uuid = desired.role_uuid
            existing.rights = desired.rights
            existing.update_date = str(datetime.now())
            db_session.add(existing)
            logger.info(f"Updated existing global role: {desired.name} (id={desired.id})")
        else:
            db_session.add(desired)
            logger.info(f"Created new global role: {desired.name} (id={desired.id})")

    db_session.commit()

    return True


# Organization creation
def install_create_organization(org_object: OrganizationCreate, db_session: Session):
    org = Organization.model_validate(org_object)

    # Complete the org object
    org.org_uuid = f"org_{uuid4()}"
    org.creation_date = str(datetime.now())
    org.update_date = str(datetime.now())

    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    # Org Config (v2 format)
    org_plan = "enterprise" if org.slug == "default" else "free"
    org_config = OrganizationConfigV2Base(
        config_version="2.0",
        plan=org_plan,
    )

    org_config = json.loads(org_config.model_dump_json())

    # OrgSettings
    org_settings = OrganizationConfig(
        org_id=int(org.id if org.id else 0),
        config=org_config,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    db_session.add(org_settings)
    db_session.commit()
    db_session.refresh(org_settings)

    if org.slug == "default":
        _apply_default_org_branding(org, org_settings, db_session)

    return org


def install_create_organization_user(
    user_object: UserCreate,
    org_slug: str,
    db_session: Session,
    *,
    is_superadmin: bool = False,
):
    user = User.model_validate(user_object)

    # Complete the user object
    user.user_uuid = f"user_{uuid4()}"
    user.password = security_hash_password(user_object.password)
    user.email_verified = not get_launchlms_config().general_config.require_email_verification
    user.email_verified_at = str(datetime.now()) if user.email_verified else None
    user.is_superadmin = is_superadmin
    user.creation_date = str(datetime.now())
    user.update_date = str(datetime.now())

    # Verifications

    # Check if Organization exists
    statement = select(Organization).where(Organization.slug == org_slug)
    org = db_session.exec(statement)

    if not org.first():
        raise HTTPException(
            status_code=409,
            detail="Organization does not exist",
        )

    # Username
    statement = select(User).where(User.username == user.username)
    result = db_session.exec(statement)

    if result.first():
        raise HTTPException(
            status_code=409,
            detail="Username already exists",
        )

    # Email
    statement = select(User).where(User.email == user.email)
    result = db_session.exec(statement)

    if result.first():
        raise HTTPException(
            status_code=409,
            detail="Email already exists",
        )

    # Exclude unset values
    user_data = user.model_dump(exclude_unset=True)
    for key, value in user_data.items():
        setattr(user, key, value)

    # Add user to database
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    # get org id
    statement = select(Organization).where(Organization.slug == org_slug)
    org = db_session.exec(statement)
    org = org.first()
    org_id = org.id if org else 0

    # Link user and organization
    user_organization = UserOrganization(
        user_id=user.id if user.id else 0,
        org_id=org_id or 0,
        role_id=ADMIN_ROLE_ID,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    db_session.add(user_organization)
    db_session.commit()
    db_session.refresh(user_organization)

    user = UserRead.model_validate(user)

    return user
