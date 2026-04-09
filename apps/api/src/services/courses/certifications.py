from typing import List
from uuid import uuid4
from datetime import datetime
from sqlmodel import Session, select
from fastapi import HTTPException, Request
from src.db.courses.certifications import (
    Certifications,
    CertificationCreate,
    CertificationRead,
    CertificationUpdate,
    CertificateUser,
    CertificateUserRead,
)
from src.db.courses.courses import Course
from src.db.courses.chapter_activities import ChapterActivity
from src.db.organizations import Organization
from src.db.organization_config import OrganizationConfig
from src.db.trail_steps import TrailStep
from src.db.users import PublicUser, AnonymousUser, User
from src.security.rbac import check_resource_access, AccessAction
from src.services.analytics.analytics import track
from src.services.analytics import events as analytics_events
from src.services.courses.openbadges import (
    DEFAULT_BADGE_CRITERIA_TEXT,
    build_assertion_payload,
    build_badge_class_payload,
    build_issuer_payload,
    get_org_badge_issuer_config,
)


def _normalize_badge_config(config: dict | None, course: Course | None = None) -> dict:
    normalized = dict(config or {})
    badge_name = normalized.get("badge_name") or normalized.get("certification_name") or (course.name if course else "")
    badge_description = normalized.get("badge_description") or normalized.get("certification_description") or (course.description if course else "")

    normalized["badge_name"] = badge_name
    normalized["badge_description"] = badge_description
    normalized["certification_name"] = badge_name
    normalized["certification_description"] = badge_description
    normalized["badge_criteria_text"] = normalized.get("badge_criteria_text") or DEFAULT_BADGE_CRITERIA_TEXT
    normalized["badge_theme"] = normalized.get("badge_theme") or normalized.get("certificate_pattern") or "professional"
    normalized["certificate_pattern"] = normalized["badge_theme"]
    return normalized


def _validate_badge_config(config: dict) -> None:
    if not config.get("badge_name"):
        raise HTTPException(status_code=422, detail="Badge name is required")
    if not config.get("badge_description"):
        raise HTTPException(status_code=422, detail="Badge description is required")
    if not (config.get("badge_criteria_text") or config.get("badge_criteria_url")):
        raise HTTPException(status_code=422, detail="Badge criteria text or URL is required")


def _get_org_and_config_for_course(course: Course, db_session: Session) -> tuple[Organization, OrganizationConfig | None]:
    org = db_session.exec(select(Organization).where(Organization.id == course.org_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org_config = db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == org.id)
    ).first()
    return org, org_config


def _validate_badge_issuer_for_org(org: Organization, org_config: OrganizationConfig | None) -> None:
    issuer_config = get_org_badge_issuer_config(org, org_config)
    if not (issuer_config.get("name") or org.name):
        raise HTTPException(status_code=422, detail="Badge issuer name is required")
    if not (issuer_config.get("email") or org.email):
        raise HTTPException(status_code=422, detail="Badge issuer email is required")


def _build_badge_response(
    request: Request,
    db_session: Session,
    cert_user: CertificateUser,
    certification: Certifications,
    course: Course,
    user: User | None = None,
) -> dict:
    org, org_config = _get_org_and_config_for_course(course, db_session)
    if user is None:
        user = db_session.exec(select(User).where(User.id == cert_user.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    badge_class = build_badge_class_payload(request, org, course, certification, org_config)
    issuer = build_issuer_payload(request, org, org_config)
    assertion = build_assertion_payload(request, org, course, certification, cert_user, user, org_config)

    return {
        "certificate_user": CertificateUserRead(**cert_user.model_dump()),
        "certification": CertificationRead(**certification.model_dump()),
        "badge_assertion": assertion,
        "badge_class": badge_class,
        "issuer": issuer,
        "open_badges": {
            "assertion": assertion,
            "badge_class": badge_class,
            "issuer": issuer,
        },
        "course": {
            "id": course.id,
            "course_uuid": course.course_uuid,
            "name": course.name,
            "description": course.description,
            "thumbnail_image": course.thumbnail_image,
            "org_id": course.org_id,
        },
        "user": {
            "id": user.id,
            "user_uuid": user.user_uuid,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
        },
        "org": {
            "id": org.id,
            "org_uuid": org.org_uuid,
            "slug": org.slug,
            "name": org.name,
            "logo_image": org.logo_image,
        },
    }


####################################################
# CRUD
####################################################


async def create_certification(
    request: Request,
    certification_object: CertificationCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> CertificationRead:
    """Create a new certification for a course"""
    
    # Check if course exists
    statement = select(Course).where(Course.id == certification_object.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    await check_resource_access(request, db_session, current_user, course.course_uuid, AccessAction.CREATE)

    normalized_config = _normalize_badge_config(certification_object.config, course)
    _validate_badge_config(normalized_config)
    org, org_config = _get_org_and_config_for_course(course, db_session)
    _validate_badge_issuer_for_org(org, org_config)

    # Create certification
    certification = Certifications(
        course_id=certification_object.course_id,
        config=normalized_config,
        certification_uuid=str(f"certification_{uuid4()}"),
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    # Insert certification in DB
    db_session.add(certification)
    db_session.commit()
    db_session.refresh(certification)

    return CertificationRead(**certification.model_dump())


async def get_certification(
    request: Request,
    certification_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> CertificationRead:
    """Get a single certification by certification_id"""
    
    statement = select(Certifications).where(Certifications.certification_uuid == certification_uuid)
    certification = db_session.exec(statement).first()

    if not certification:
        raise HTTPException(
            status_code=404,
            detail="Certification not found",
        )

    # Get course for RBAC check
    statement = select(Course).where(Course.id == certification.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    await check_resource_access(request, db_session, current_user, course.course_uuid, AccessAction.READ)

    return CertificationRead(**certification.model_dump())


async def get_certifications_by_course(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> List[CertificationRead]:
    """Get all certifications for a course"""
    
    # Get course for RBAC check
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    await check_resource_access(request, db_session, current_user, course_uuid, AccessAction.READ)

    # Get certifications for this course
    statement = select(Certifications).where(Certifications.course_id == course.id)
    certifications = db_session.exec(statement).all()

    return [CertificationRead(**certification.model_dump()) for certification in certifications]


async def update_certification(
    request: Request,
    certification_uuid: str,
    certification_object: CertificationUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> CertificationRead:
    """Update a certification"""
    
    statement = select(Certifications).where(Certifications.certification_uuid == certification_uuid)
    certification = db_session.exec(statement).first()

    if not certification:
        raise HTTPException(
            status_code=404,
            detail="Certification not found",
        )

    # Get course for RBAC check
    statement = select(Course).where(Course.id == certification.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    await check_resource_access(request, db_session, current_user, course.course_uuid, AccessAction.UPDATE)

    # Update only the fields that were passed in
    for var, value in vars(certification_object).items():
        if value is not None:
            if var == "config":
                normalized_config = _normalize_badge_config(value, course)
                _validate_badge_config(normalized_config)
                org, org_config = _get_org_and_config_for_course(course, db_session)
                _validate_badge_issuer_for_org(org, org_config)
                setattr(certification, var, normalized_config)
            else:
                setattr(certification, var, value)

    # Update the update_date
    certification.update_date = str(datetime.now())

    db_session.add(certification)
    db_session.commit()
    db_session.refresh(certification)

    return CertificationRead(**certification.model_dump())


async def delete_certification(
    request: Request,
    certification_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """Delete a certification"""
    
    statement = select(Certifications).where(Certifications.certification_uuid == certification_uuid)
    certification = db_session.exec(statement).first()

    if not certification:
        raise HTTPException(
            status_code=404,
            detail="Certification not found",
        )

    # Get course for RBAC check
    statement = select(Course).where(Course.id == certification.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    await check_resource_access(request, db_session, current_user, course.course_uuid, AccessAction.DELETE)

    db_session.delete(certification)
    db_session.commit()

    return {"detail": "Certification deleted successfully"}


####################################################
# Certificate User Functions
####################################################


async def create_certificate_user(
    request: Request,
    user_id: int,
    certification_id: int,
    db_session: Session,
    current_user: PublicUser | AnonymousUser | None = None,
) -> CertificateUserRead:
    """
    Create a certificate user link
    
    SECURITY NOTES:
    - This function should only be called by authorized users (course owners, instructors, or system)
    - When called from check_course_completion_and_create_certificate, it's a system operation
    - When called directly, requires proper RBAC checks
    """
    
    # Check if certification exists
    statement = select(Certifications).where(Certifications.id == certification_id)
    certification = db_session.exec(statement).first()

    if not certification:
        raise HTTPException(
            status_code=404,
            detail="Certification not found",
        )

    # Validate badge class and issuer metadata before issuing.
    statement = select(Course).where(Course.id == certification.course_id)
    course = db_session.exec(statement).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    certification.config = _normalize_badge_config(certification.config, course)
    _validate_badge_config(certification.config)
    org, org_config = _get_org_and_config_for_course(course, db_session)
    _validate_badge_issuer_for_org(org, org_config)

    # SECURITY: If current_user is provided, perform RBAC check
    if current_user:
        # Get course for RBAC check
        # Require course ownership or instructor role for creating certificates
        await check_resource_access(request, db_session, current_user, course.course_uuid, AccessAction.CREATE)

    # Check if certificate user already exists
    statement = select(CertificateUser).where(
        CertificateUser.user_id == user_id,
        CertificateUser.certification_id == certification_id
    )
    existing_certificate_user = db_session.exec(statement).first()

    if existing_certificate_user:
        raise HTTPException(
            status_code=400,
            detail="User already has a certificate for this course",
        )

    # Generate readable certificate user UUID
    current_year = datetime.now().year
    current_month = datetime.now().month
    current_day = datetime.now().day
    
    # Get user to extract user_uuid
    statement = select(User).where(User.id == user_id)
    user = db_session.exec(statement).first()
    
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )
    
    # Extract last 4 characters from user_uuid for uniqueness (since all start with "user_")
    user_uuid_short = user.user_uuid[-4:] if user.user_uuid else "USER"
    
    # Generate random 2-letter prefix
    import random
    import string
    random_prefix = ''.join(random.choices(string.ascii_uppercase, k=2))
    
    # Get the count of existing certificate users for this user today
    today_user_prefix = f"{random_prefix}-{current_year}{current_month:02d}{current_day:02d}-{user_uuid_short}-"
    statement = select(CertificateUser).where(
        CertificateUser.user_certification_uuid.startswith(today_user_prefix)
    )
    existing_certificates = db_session.exec(statement).all()
    
    # Generate next sequential number for this user today
    next_number = len(existing_certificates) + 1
    certificate_number = f"{next_number:03d}"  # Format as 3-digit number with leading zeros
    
    user_certification_uuid = f"{today_user_prefix}{certificate_number}"

    # Create certificate user
    certificate_user = CertificateUser(
        user_id=user_id,
        certification_id=certification_id,
        user_certification_uuid=user_certification_uuid,
        created_at=str(datetime.now()),
        updated_at=str(datetime.now()),
    )

    db_session.add(certificate_user)
    db_session.commit()
    db_session.refresh(certificate_user)

    # Track certificate_claimed event for analytics
    try:
        course = db_session.exec(
            select(Course).where(Course.id == certification.course_id)
        ).first()
        if course:
            await track(
                event_name=analytics_events.CERTIFICATE_CLAIMED,
                org_id=course.org_id,
                user_id=user_id,
                properties={
                    "course_uuid": course.course_uuid,
                },
            )
    except Exception:
        pass  # Don't fail certificate creation if tracking fails

    return CertificateUserRead(**certificate_user.model_dump())


async def get_user_certificates_for_course(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> List[dict]:
    """Get all certificates for a user in a specific course with certification details"""
    
    # Check if course exists
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    await check_resource_access(request, db_session, current_user, course_uuid, AccessAction.READ)

    # Get all certifications for this course
    statement = select(Certifications).where(Certifications.course_id == course.id)
    certifications = db_session.exec(statement).all()

    if not certifications:
        return []

    # Get all certificate users for this user and these certifications
    certification_ids = [cert.id for cert in certifications if cert.id]
    if not certification_ids:
        return []

    # Batch fetch all certificate users for this user and these certifications
    statement = select(CertificateUser).where(
        CertificateUser.user_id == current_user.id,
        CertificateUser.certification_id.in_(certification_ids)  # type: ignore
    )
    cert_users = db_session.exec(statement).all()

    if not cert_users:
        return []

    # Build a map of certification_id -> Certifications (already fetched above)
    cert_map = {cert.id: cert for cert in certifications if cert.id}

    user = db_session.exec(select(User).where(User.id == current_user.id)).first()
    result = []
    for cert_user in cert_users:
        certification = cert_map.get(cert_user.certification_id)
        if not certification or not user:
            continue
        result.append(
            _build_badge_response(request, db_session, cert_user, certification, course, user=user)
        )

    return result


async def check_course_completion_and_create_certificate(
    request: Request,
    user_id: int,
    course_id: int,
    db_session: Session,
) -> bool:
    """
    Check if all activities in a course are completed and create certificate if so
    
    SECURITY NOTES:
    - This function is called by the system when activities are completed
    - It should only create certificates for users who have actually completed the course
    - The function is called from mark_activity_as_done_for_user which already has RBAC checks
    """
    
    # Get all activities in the course
    statement = select(ChapterActivity).where(ChapterActivity.course_id == course_id)
    course_activities = db_session.exec(statement).all()
    
    if not course_activities:
        return False  # No activities in course
    
    # Get all completed activities for this user in this course
    statement = select(TrailStep).where(
        TrailStep.user_id == user_id,
        TrailStep.course_id == course_id,
        TrailStep.complete == True
    )
    completed_activities = db_session.exec(statement).all()
    
    # Check if all activities are completed
    if len(completed_activities) >= len(course_activities):
        # All activities completed, check if certification exists for this course
        statement = select(Certifications).where(Certifications.course_id == course_id)
        certification = db_session.exec(statement).first()
        
        if certification and certification.id:
            # SECURITY: Create certificate user link (system operation, no RBAC needed here)
            # This is called from mark_activity_as_done_for_user which already has proper RBAC checks
            try:
                await create_certificate_user(request, user_id, certification.id, db_session)
                return True  # Newly completed
            except HTTPException as e:
                if e.status_code == 400 and "already has a certificate" in e.detail:
                    # Certificate already exists — course was completed before
                    return False
                else:
                    raise e
        
    return False


async def get_certificate_by_user_certification_uuid(
    request: Request,
    user_certification_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """Get a certificate by user_certification_uuid with certification details"""
    
    # Get certificate user by user_certification_uuid
    statement = select(CertificateUser).where(
        CertificateUser.user_certification_uuid == user_certification_uuid
    )
    certificate_user = db_session.exec(statement).first()

    if not certificate_user:
        raise HTTPException(
            status_code=404,
            detail="Certificate not found",
        )

    # Get the associated certification
    statement = select(Certifications).where(Certifications.id == certificate_user.certification_id)
    certification = db_session.exec(statement).first()

    if not certification:
        raise HTTPException(
            status_code=404,
            detail="Certification not found",
        )

    # Get course information
    statement = select(Course).where(Course.id == certification.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # No RBAC check - allow anyone to access badge assertions by UUID
    user = db_session.exec(select(User).where(User.id == certificate_user.user_id)).first()
    return _build_badge_response(request, db_session, certificate_user, certification, course, user=user)


async def get_open_badges_issuer_by_org_uuid(
    request: Request,
    org_uuid: str,
    db_session: Session,
) -> dict:
    org = db_session.exec(select(Organization).where(Organization.org_uuid == org_uuid)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org_config = db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == org.id)
    ).first()
    return build_issuer_payload(request, org, org_config)


async def get_open_badges_badge_class_by_course_uuid(
    request: Request,
    course_uuid: str,
    db_session: Session,
) -> dict:
    course = db_session.exec(select(Course).where(Course.course_uuid == course_uuid)).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    certification = db_session.exec(
        select(Certifications).where(Certifications.course_id == course.id)
    ).first()
    if not certification:
        raise HTTPException(status_code=404, detail="Badge class not found")

    org, org_config = _get_org_and_config_for_course(course, db_session)
    return build_badge_class_payload(request, org, course, certification, org_config)


async def get_open_badges_assertion_by_uuid(
    request: Request,
    user_certification_uuid: str,
    db_session: Session,
) -> dict:
    certificate_user = db_session.exec(
        select(CertificateUser).where(CertificateUser.user_certification_uuid == user_certification_uuid)
    ).first()
    if not certificate_user:
        raise HTTPException(status_code=404, detail="Badge assertion not found")

    certification = db_session.exec(
        select(Certifications).where(Certifications.id == certificate_user.certification_id)
    ).first()
    if not certification:
        raise HTTPException(status_code=404, detail="Badge class not found")

    course = db_session.exec(select(Course).where(Course.id == certification.course_id)).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    user = db_session.exec(select(User).where(User.id == certificate_user.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    org, org_config = _get_org_and_config_for_course(course, db_session)
    return build_assertion_payload(request, org, course, certification, certificate_user, user, org_config)


async def get_all_user_certificates(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> List[dict]:
    """Get all certificates for the current user with complete linked information"""
    
    # Get all certificate users for this user
    statement = select(CertificateUser).where(CertificateUser.user_id == current_user.id)
    certificate_users = db_session.exec(statement).all()

    if not certificate_users:
        return []

    # Batch fetch all certifications
    cert_ids = list({cu.certification_id for cu in certificate_users})
    statement = select(Certifications).where(Certifications.id.in_(cert_ids))  # type: ignore
    certifications = db_session.exec(statement).all()
    cert_map = {cert.id: cert for cert in certifications}

    # Batch fetch all courses
    course_ids = list({cert.course_id for cert in certifications if cert.course_id})
    if course_ids:
        statement = select(Course).where(Course.id.in_(course_ids))  # type: ignore
        courses = db_session.exec(statement).all()
        course_map = {course.id: course for course in courses}
    else:
        course_map = {}

    # Batch fetch user information (all cert_users belong to current_user, but keep generic)
    from src.db.users import User
    user_ids = list({cu.user_id for cu in certificate_users})
    statement = select(User).where(User.id.in_(user_ids))  # type: ignore
    users = db_session.exec(statement).all()
    user_map = {user.id: user for user in users}

    result = []
    for cert_user in certificate_users:
        certification = cert_map.get(cert_user.certification_id)
        if not certification:
            continue

        course = course_map.get(certification.course_id)
        if not course:
            continue

        user = user_map.get(cert_user.user_id)

        if not user:
            continue

        result.append(
            _build_badge_response(request, db_session, cert_user, certification, course, user=user)
        )

    return result
