from datetime import timedelta, datetime, timezone
from typing import Literal, Optional
from fastapi import Depends, APIRouter, HTTPException, Response, status, Request, Form
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select
from src.db.collections import Collection
from src.db.collections_courses import CollectionCourse
from src.db.courses.activities import Activity, ActivitySubTypeEnum, ActivityTypeEnum
from src.db.courses.chapter_activities import ChapterActivity
from src.db.courses.chapters import Chapter
from src.db.courses.course_chapters import CourseChapter
from src.db.courses.courses import Course
from src.db.organizations import Organization
from src.db.organization_config import OrganizationConfig
from src.db.users import AnonymousUser, User, UserCreate, UserRead
from src.core.events.database import get_db_session
from config.config import get_launchlms_config
from src.security.auth import (
    authenticate_user,
    get_current_user,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    extract_jwt_from_request,
    JWT_ACCESS_TOKEN_EXPIRES,
    JWT_REFRESH_COOKIE_NAME,
    JWT_COOKIE_NAME,
)
from src.security.cookies import get_cookie_domain_for_request, is_request_secure
from src.services.guest_sessions import transfer_guest_session_data_to_user
from src.services.shared_content import owner_org_payload
from src.services.courses.courses import get_course_meta
from src.services.courses.activities.activities import get_activity
from src.services.auth.utils import signWithGoogle
from src.services.dev.dev import isDevModeEnabled
from src.services.security.rate_limiting import (
    check_login_rate_limit,
    check_refresh_rate_limit,
    check_email_verification_rate_limit,
    get_client_ip,
)
from src.services.security.account_lockout import (
    check_account_locked,
    record_failed_login,
    reset_failed_attempts,
    update_login_info,
    format_lockout_message,
)
from src.services.users.email_verification import (
    verify_email_token,
    resend_verification_email,
)


def get_token_expiry_ms() -> Optional[int]:
    """Get the token expiry timestamp in milliseconds for frontend use."""
    if isDevModeEnabled() or JWT_ACCESS_TOKEN_EXPIRES is None:
        return None  # No expiry in dev mode
    expiry_time = datetime.now(timezone.utc) + JWT_ACCESS_TOKEN_EXPIRES
    return int(expiry_time.timestamp() * 1000)


router = APIRouter()

ONBOARDING_SYSTEM_TYPE = "onboarding"
ONBOARDING_COURSE_UUID = "course_system_onboarding_welcome"
ONBOARDING_COLLECTION_UUID = "collection_system_onboarding"
ONBOARDING_CHAPTER_UUID = "chapter_system_onboarding_welcome"
ONBOARDING_ACTIVITY_UUID = "activity_system_onboarding_profile_quiz"
ONBOARDING_GOALS = {"higher_education", "employment", "self_starting", "not_sure"}


class WelcomeSignupRequest(BaseModel):
    email: EmailStr
    password: str
    quiz_result: Optional[dict] = None


class WelcomeSignupEmailCheckRequest(BaseModel):
    email: EmailStr


def _get_owner_org(db_session: Session) -> Organization:
    owner_org = db_session.exec(select(Organization).order_by(Organization.id).limit(1)).first()
    if not owner_org:
        raise HTTPException(status_code=404, detail="Owner organization not found")
    return owner_org


def _onboarding_quiz_content() -> dict:
    return {
        "type": "doc",
        "content": [
            {
                "type": "quizTextBlock",
                "attrs": {
                    "question_uuid": "onboarding_name",
                    "question_text": "What should we call you?",
                    "description": "Tell us your first and last name so we can personalize your profile.",
                    "input_size": "single_line",
                    "fields": [
                        {
                            "key": "first_name",
                            "label": "First name",
                            "placeholder": "First name",
                            "required": True,
                        },
                        {
                            "key": "last_name",
                            "label": "Last name",
                            "placeholder": "Last name",
                            "required": True,
                        },
                    ],
                    "background_gradient_seed": "onboarding-name",
                },
            },
            {
                "type": "quizSelectBlock",
                "attrs": {
                    "question_uuid": "onboarding_next_step",
                    "question_text": "What next step are you working towards?",
                    "display_style": "text",
                    "show_responses": True,
                    "option_count": 4,
                    "background_gradient_seed": "onboarding-next-step",
                    "options": [
                        {
                            "option_uuid": "higher_education",
                            "label": "Higher education",
                            "image_block_object": None,
                            "gradient_seed": "higher-education",
                            "info_message": "Great. We will help you organize the work that gets you ready for your next academic step.",
                            "info_image_block_object": None,
                        },
                        {
                            "option_uuid": "employment",
                            "label": "Employment",
                            "image_block_object": None,
                            "gradient_seed": "employment",
                            "info_message": "Great. We will help you build the profile, skills, and evidence that support your job goals.",
                            "info_image_block_object": None,
                        },
                        {
                            "option_uuid": "self_starting",
                            "label": "Self Starting",
                            "image_block_object": None,
                            "gradient_seed": "self-starting",
                            "info_message": "Great. We will help you shape a path for building, launching, and learning as you go.",
                            "info_image_block_object": None,
                        },
                        {
                            "option_uuid": "not_sure",
                            "label": "Not sure",
                            "image_block_object": None,
                            "gradient_seed": "not-sure",
                            "info_message": "That is fine. We will help you explore options and set up a profile that can grow with you.",
                            "info_image_block_object": None,
                        },
                    ],
                },
            },
        ],
    }


def _ensure_onboarding_content(db_session: Session) -> tuple[Organization, Course, Chapter, Activity]:
    owner_org = _get_owner_org(db_session)
    now = str(datetime.now())

    collection = db_session.exec(
        select(Collection).where(Collection.collection_uuid == ONBOARDING_COLLECTION_UUID)
    ).first()
    if not collection:
        collection = Collection(
            name="System Onboarding",
            description="Hidden onboarding collection",
            public=False,
            shared=False,
            hidden=True,
            protected=True,
            system_type=ONBOARDING_SYSTEM_TYPE,
            org_id=owner_org.id or 0,
            collection_uuid=ONBOARDING_COLLECTION_UUID,
            creation_date=now,
            update_date=now,
        )
        db_session.add(collection)
        db_session.commit()
        db_session.refresh(collection)

    course = db_session.exec(select(Course).where(Course.course_uuid == ONBOARDING_COURSE_UUID)).first()
    if not course:
        course = Course(
            name="Welcome",
            description="Welcome to Launch LMS",
            about="A short onboarding flow to personalize your profile.",
            learnings="",
            tags="",
            thumbnail_type="image",
            thumbnail_image="",
            thumbnail_video="",
            public=True,
            shared=False,
            guest_access=True,
            published=True,
            coming_soon=False,
            core_course=False,
            core_course_order=None,
            hidden=True,
            protected=True,
            system_type=ONBOARDING_SYSTEM_TYPE,
            open_to_contributors=False,
            org_id=owner_org.id or 0,
            collection_id=collection.id,
            course_uuid=ONBOARDING_COURSE_UUID,
            creation_date=now,
            update_date=now,
        )
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)

    if course.collection_id != collection.id:
        course.collection_id = collection.id
        course.update_date = now
        db_session.add(course)

    link = db_session.exec(
        select(CollectionCourse).where(
            CollectionCourse.collection_id == collection.id,
            CollectionCourse.course_id == course.id,
        )
    ).first()
    if not link:
        db_session.add(
            CollectionCourse(
                collection_id=collection.id or 0,
                course_id=course.id or 0,
                org_id=owner_org.id or 0,
                creation_date=now,
                update_date=now,
            )
        )

    chapter = db_session.exec(select(Chapter).where(Chapter.chapter_uuid == ONBOARDING_CHAPTER_UUID)).first()
    if not chapter:
        chapter = Chapter(
            name="Welcome",
            description="Set up your profile",
            icon="sparkles",
            course_id=course.id or 0,
            org_id=owner_org.id or 0,
            chapter_uuid=ONBOARDING_CHAPTER_UUID,
            creation_date=now,
            update_date=now,
        )
        db_session.add(chapter)
        db_session.commit()
        db_session.refresh(chapter)

    course_chapter = db_session.exec(
        select(CourseChapter).where(
            CourseChapter.course_id == course.id,
            CourseChapter.chapter_id == chapter.id,
        )
    ).first()
    if not course_chapter:
        db_session.add(
            CourseChapter(
                course_id=course.id or 0,
                chapter_id=chapter.id or 0,
                org_id=owner_org.id or 0,
                order=1,
                creation_date=now,
                update_date=now,
            )
        )

    activity = db_session.exec(select(Activity).where(Activity.activity_uuid == ONBOARDING_ACTIVITY_UUID)).first()
    if not activity:
        activity = Activity(
            name="Welcome",
            description="Tell us about yourself",
            icon="user-round-pen",
            activity_type=ActivityTypeEnum.TYPE_QUIZ,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_QUIZ_STANDARD,
            content=_onboarding_quiz_content(),
            details={
                "quiz_mode": "ungraded",
                "onboarding_locked": True,
                "results_template": {},
            },
            published=True,
            org_id=owner_org.id or 0,
            course_id=course.id or 0,
            activity_uuid=ONBOARDING_ACTIVITY_UUID,
            creation_date=now,
            update_date=now,
        )
        db_session.add(activity)
        db_session.commit()
        db_session.refresh(activity)

    chapter_activity = db_session.exec(
        select(ChapterActivity).where(
            ChapterActivity.chapter_id == chapter.id,
            ChapterActivity.activity_id == activity.id,
        )
    ).first()
    if not chapter_activity:
        db_session.add(
            ChapterActivity(
                chapter_id=chapter.id or 0,
                activity_id=activity.id or 0,
                course_id=course.id or 0,
                org_id=owner_org.id or 0,
                order=1,
                creation_date=now,
                update_date=now,
            )
        )

    db_session.commit()
    db_session.refresh(course)
    db_session.refresh(chapter)
    db_session.refresh(activity)
    return owner_org, course, chapter, activity


def _extract_onboarding_answers(quiz_result: Optional[dict]) -> dict:
    answers = quiz_result or {}
    result_json = answers.get("result_json", answers) if isinstance(answers, dict) else {}
    raw_answers = result_json.get("answers", []) if isinstance(result_json, dict) else []
    parsed = {
        "first_name": "",
        "last_name": "",
        "next_step": "",
    }

    for item in raw_answers if isinstance(raw_answers, list) else []:
        question_uuid = item.get("question_uuid")
        answer_json = item.get("answer_json") or {}
        if question_uuid == "onboarding_name" and answer_json.get("type") == "text_fields":
            fields = answer_json.get("fields") or {}
            parsed["first_name"] = str(fields.get("first_name") or "").strip()
            parsed["last_name"] = str(fields.get("last_name") or "").strip()
        if question_uuid == "onboarding_next_step" and answer_json.get("type") == "select":
            parsed["next_step"] = str(answer_json.get("option_uuid") or "").strip()

    return parsed


def _profile_grid(x: int, y: int, w: int, h: int) -> dict:
    return {"x": x, "y": y, "w": w, "h": h}


def _profile_layout_item(item_id: str, item_type: str, x: int, y: int, w: int, h: int) -> dict:
    return {
        "id": item_id,
        "type": item_type,
        "grid": _profile_grid(x, y, w, h),
        "mobileGrid": _profile_grid(0 if x == 0 else 1, y, min(2, w), h),
    }


def _custom_profile_section(item_id: str, item_type: str, title: str = "") -> dict:
    return {
        "id": item_id,
        "type": item_type,
        "title": title,
        "body": "",
        "url": "",
        "mediaUrl": "",
    }


def _build_onboarding_profile_preset(next_step: str, recommended_badges: list[str]) -> dict:
    goal = next_step if next_step in ONBOARDING_GOALS else "not_sure"

    if goal == "employment":
        layout = [
            _profile_layout_item("timeline", "timeline", 0, 0, 2, 3),
            _profile_layout_item("portfolio", "portfolio", 2, 0, 1, 3),
            _profile_layout_item("achievements", "achievements", 0, 3, 1, 2),
            _profile_layout_item("employment-links", "link", 1, 3, 2, 1),
        ]
        sections = [_custom_profile_section("employment-links", "link", "Resume or work sample")]
        timeline_enabled = True
    elif goal == "higher_education":
        layout = [
            _profile_layout_item("achievements", "achievements", 0, 0, 1, 3),
            _profile_layout_item("application-notes", "text", 1, 0, 2, 2),
            _profile_layout_item("portfolio", "portfolio", 0, 3, 2, 3),
            _profile_layout_item("timeline", "timeline", 2, 2, 1, 3),
        ]
        sections = [_custom_profile_section("application-notes", "text", "Application notes")]
        timeline_enabled = True
    elif goal == "self_starting":
        layout = [
            _profile_layout_item("portfolio", "portfolio", 0, 0, 2, 3),
            _profile_layout_item("social-link", "link", 2, 0, 1, 1),
            _profile_layout_item("instagramPreview", "instagramPreview", 0, 3, 1, 3),
            _profile_layout_item("youtubePreview", "youtubePreview", 1, 3, 1, 3),
            _profile_layout_item("achievements", "achievements", 2, 1, 1, 3),
        ]
        sections = [_custom_profile_section("social-link", "link", "Primary link")]
        timeline_enabled = False
    else:
        layout = [
            _profile_layout_item("portfolio", "portfolio", 0, 0, 2, 3),
            _profile_layout_item("achievements", "achievements", 2, 0, 1, 3),
            _profile_layout_item("timeline", "timeline", 0, 3, 2, 3),
        ]
        sections = []
        timeline_enabled = True

    return {
        "header": {"socials": []},
        "featured": {"cards": [], "publicVisible": True},
        "achievements": {"featuredIds": [], "publicVisible": True},
        "timelineEnabled": timeline_enabled,
        "timelinePublicVisible": True,
        "timeline": [],
        "layout": layout,
        "sections": sections,
        "onboarding": {
            "next_step": goal,
            "recommended_badges": recommended_badges[:3],
            "completed_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def _get_onboarding_recommended_badges(owner_org: Organization, next_step: str, db_session: Session) -> list[str]:
    org_config = db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == owner_org.id)
    ).first()
    config = org_config.config if org_config else {}
    customization = config.get("customization", {}) if isinstance(config, dict) else {}
    onboarding_config = {}
    if isinstance(config, dict):
        onboarding_config = customization.get("onboarding") or config.get("onboarding", {})
    recommended = onboarding_config.get("recommended_badges", {}) if isinstance(onboarding_config, dict) else {}
    goal = next_step if next_step in ONBOARDING_GOALS else "not_sure"
    badge_uuids = recommended.get(goal, []) if isinstance(recommended, dict) else []
    configured_badges = [
        value if str(value).startswith("course_") else f"course_{value}"
        for value in badge_uuids
        if isinstance(value, str) and value.strip()
    ][:3]
    if len(configured_badges) >= 3:
        return configured_badges

    configured_set = set(configured_badges)
    fallback_courses = db_session.exec(
        select(Course).where(
            Course.org_id == owner_org.id,
            Course.public == True,
            Course.hidden == False,
            Course.system_type == None,
        )
    ).all()
    fallback_badges = [
        course.course_uuid
        for course in sorted(
            fallback_courses,
            key=lambda course: course.creation_date or course.update_date or "",
            reverse=True,
        )
        if course.course_uuid and course.course_uuid not in configured_set
    ]

    return (configured_badges + fallback_badges)[:3]


def _generate_onboarding_username(email: str, db_session: Session) -> str:
    base = email.split("@", 1)[0].lower()
    base = "".join(ch if ch.isalnum() else "_" for ch in base).strip("_")[:24] or "learner"
    candidate = base
    counter = 1
    while db_session.exec(select(User).where(User.username == candidate)).first():
        counter += 1
        candidate = f"{base}_{counter}"
    return candidate


def set_auth_cookies(response: Response, access_token: str, refresh_token: str, request: Request = None):
    """Helper to set authentication cookies."""
    is_secure = is_request_secure(request)
    cookie_domain = get_cookie_domain_for_request(request) if request else None

    response.set_cookie(
        key=JWT_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        domain=cookie_domain,
        expires=int(timedelta(hours=8).total_seconds()),
    )
    response.set_cookie(
        key=JWT_REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        domain=cookie_domain,
        expires=int(timedelta(days=30).total_seconds()),
    )


def unset_auth_cookies(response: Response, request: Request = None):
    """Helper to unset authentication cookies."""
    cookie_domain = get_cookie_domain_for_request(request) if request else None

    response.delete_cookie(key=JWT_COOKIE_NAME, domain=cookie_domain)
    response.delete_cookie(key=JWT_REFRESH_COOKIE_NAME, domain=cookie_domain)


@router.get("/onboarding/welcome")
async def get_welcome_onboarding(
    request: Request,
    db_session: Session = Depends(get_db_session),
):
    owner_org, course, chapter, activity = _ensure_onboarding_content(db_session)
    course_payload = await get_course_meta(
        request,
        course.course_uuid,
        with_unpublished_activities=False,
        current_user=AnonymousUser(),
        db_session=db_session,
    )
    activity_payload = await get_activity(
        request,
        activity.activity_uuid,
        AnonymousUser(),
        db_session,
    )
    org_payload = owner_org.model_dump()
    org_payload.update(owner_org_payload(owner_org, owner_org.id))

    return {
        "org": org_payload,
        "course": course_payload,
        "chapter": chapter.model_dump(),
        "activity": activity_payload,
        "activity_id": activity.activity_uuid.replace("activity_", ""),
        "course_uuid": course.course_uuid.replace("course_", ""),
    }


@router.post("/signup/welcome/check-email")
async def check_welcome_signup_email(
    body: WelcomeSignupEmailCheckRequest,
    db_session: Session = Depends(get_db_session),
):
    existing = db_session.exec(select(User).where(User.email == body.email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")
    return {"available": True}


@router.post("/signup/welcome")
async def complete_welcome_signup(
    request: Request,
    response: Response,
    body: WelcomeSignupRequest,
    db_session: Session = Depends(get_db_session),
):
    owner_org, _, _, _ = _ensure_onboarding_content(db_session)

    existing = db_session.exec(select(User).where(User.email == body.email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")

    onboarding = _extract_onboarding_answers(body.quiz_result)
    recommended_badges = _get_onboarding_recommended_badges(
        owner_org,
        onboarding["next_step"],
        db_session,
    )
    profile_preset = _build_onboarding_profile_preset(
        onboarding["next_step"],
        recommended_badges,
    )
    user_create = UserCreate(
        username=_generate_onboarding_username(body.email, db_session),
        email=body.email,
        password=body.password,
        first_name=onboarding["first_name"],
        last_name=onboarding["last_name"],
        bio="",
        details={},
        profile=profile_preset,
    )

    from src.services.users.users import create_user

    user_read = await create_user(
        request,
        db_session,
        AnonymousUser(),
        user_create,
        owner_org.id or 0,
        signup_provider="onboarding",
    )

    user = db_session.exec(select(User).where(User.id == user_read.id)).first()
    if not user:
        raise HTTPException(status_code=500, detail="Created user could not be loaded")

    user.profile = {
        **(user.profile or {}),
        **profile_preset,
    }
    user.first_name = onboarding["first_name"]
    user.last_name = onboarding["last_name"]
    user.update_date = str(datetime.now())
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=JWT_ACCESS_TOKEN_EXPIRES,
    )
    refresh_token = create_refresh_token(data={"sub": user.email})
    set_auth_cookies(response, access_token, refresh_token, request)
    transfer_guest_session_data_to_user(
        request=request,
        response=response,
        db_session=db_session,
        user=UserRead.model_validate(user),
    )

    return {
        "user": UserRead.model_validate(user),
        "tokens": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expiry": get_token_expiry_ms(),
        },
    }


@router.get("/refresh")
def refresh(request: Request, response: Response):
    """
    Validates the refresh token and issues a new access token.
    The refresh token is read from cookies.
    """
    # Rate limit refresh endpoint to prevent brute force attacks
    is_allowed, retry_after = check_refresh_rate_limit(request)
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "RATE_LIMITED",
                "message": "Too many refresh attempts. Please try again later.",
                "retry_after": retry_after,
            },
        )

    refresh_token = request.cookies.get(JWT_REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_refresh_token(refresh_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    current_user = payload.get("sub")
    new_access_token = create_access_token(
        data={"sub": current_user},
        expires_delta=JWT_ACCESS_TOKEN_EXPIRES
    )

    cookie_domain = get_cookie_domain_for_request(request)
    is_secure = is_request_secure(request)
    response.set_cookie(
        key=JWT_COOKIE_NAME,
        value=new_access_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        domain=cookie_domain,
        expires=int(timedelta(hours=8).total_seconds()),
    )
    return {"access_token": new_access_token, "expiry": get_token_expiry_ms()}


@router.post("/login")
async def login(
    request: Request,
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
    db_session: Session = Depends(get_db_session),
):
    # Step 1: Check rate limit (IP-based)
    is_allowed, retry_after = check_login_rate_limit(request)
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "RATE_LIMITED",
                "message": f"Too many login attempts. Please try again in {retry_after // 60} minutes.",
                "retry_after": retry_after,
            },
        )

    # Step 2: Get user to check lockout status
    statement = select(User).where(User.email == username)
    user_record = db_session.exec(statement).first()

    if user_record:
        # Step 3: Check if account is locked
        is_locked, remaining_seconds = check_account_locked(user_record)
        if is_locked and remaining_seconds:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail={
                    "code": "ACCOUNT_LOCKED",
                    "message": format_lockout_message(remaining_seconds),
                    "retry_after": remaining_seconds,
                },
            )

    # Step 4: Authenticate user
    user = await authenticate_user(
        request, username, password, db_session
    )

    if not user:
        # Record failed attempt if user exists
        if user_record:
            is_now_locked, lockout_duration = record_failed_login(user_record, db_session)
            if is_now_locked:
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail={
                        "code": "ACCOUNT_LOCKED",
                        "message": f"Account locked due to too many failed attempts. Please try again in {lockout_duration // 60} minutes.",
                        "retry_after": lockout_duration,
                    },
                )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Incorrect Email or password",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Step 5: Check email verification when explicitly enabled
    if not user.email_verified and get_launchlms_config().general_config.require_email_verification:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "EMAIL_NOT_VERIFIED",
                "message": "Please verify your email address before logging in. Check your inbox for the verification email.",
                "email": user.email,
            },
        )

    # Step 6: Reset failed attempts and update login info
    reset_failed_attempts(user, db_session)
    client_ip = get_client_ip(request)
    update_login_info(user, client_ip, db_session)

    # Step 7: Issue tokens
    access_token = create_access_token(
        data={"sub": username},
        expires_delta=JWT_ACCESS_TOKEN_EXPIRES
    )
    refresh_token = create_refresh_token(data={"sub": username})

    set_auth_cookies(response, access_token, refresh_token, request)
    transfer_guest_session_data_to_user(
        request=request,
        response=response,
        db_session=db_session,
        user=UserRead.model_validate(user),
    )

    user = UserRead.model_validate(user)

    result = {
        "user": user,
        "tokens": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expiry": get_token_expiry_ms(),
        },
    }
    return result


class ThirdPartyLogin(BaseModel):
    email: EmailStr
    provider: Literal["google"]
    access_token: str


@router.post("/oauth")
async def third_party_login(
    request: Request,
    response: Response,
    body: ThirdPartyLogin,
    org_id: Optional[int] = None,
    current_user: AnonymousUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if not get_launchlms_config().general_config.auth_oauth_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OAuth login is disabled",
        )

    # Google
    if body.provider == "google":

        user = await signWithGoogle(
            request, body.access_token, body.email, org_id, current_user, db_session
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=JWT_ACCESS_TOKEN_EXPIRES
    )
    refresh_token = create_refresh_token(data={"sub": user.email})

    set_auth_cookies(response, access_token, refresh_token, request)
    transfer_guest_session_data_to_user(
        request=request,
        response=response,
        db_session=db_session,
        user=UserRead.model_validate(user),
    )

    user = UserRead.model_validate(user)

    result = {
        "user": user,
        "tokens": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expiry": get_token_expiry_ms(),
        },
    }
    return result


@router.delete("/logout")
def logout(request: Request, response: Response):
    """
    Because the JWT are stored in an httponly cookie now, we cannot
    log the user out by simply deleting the cookies in the frontend.
    We need the backend to send us a response to delete the cookies.
    """
    token = extract_jwt_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    unset_auth_cookies(response, request)
    return {"msg": "Successfully logout"}


class VerifyEmailRequest(BaseModel):
    token: str
    user_uuid: str
    org_uuid: str


@router.post("/verify-email")
async def api_verify_email(
    request: Request,
    body: VerifyEmailRequest,
    db_session: Session = Depends(get_db_session),
):
    """
    Verify user email with token.
    """
    # Rate limit: 5 attempts per 5 minutes per user_uuid
    is_allowed, retry_after = check_email_verification_rate_limit(body.user_uuid)
    if not is_allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many verification attempts. Please try again in {retry_after // 60} minutes.",
        )

    result = await verify_email_token(
        request=request,
        db_session=db_session,
        token=body.token,
        user_uuid=body.user_uuid,
        org_uuid=body.org_uuid,
    )
    return {"message": result}


class ResendVerificationRequest(BaseModel):
    email: EmailStr
    org_id: Optional[int] = None


@router.post("/resend-verification")
async def api_resend_verification_email(
    request: Request,
    body: ResendVerificationRequest,
    db_session: Session = Depends(get_db_session),
):
    """
    Resend verification email (rate limited).
    """
    result = await resend_verification_email(
        request=request,
        db_session=db_session,
        email=body.email,
        org_id=body.org_id,
    )
    return {"message": result}
