import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from config.config import get_launchlms_config
from migrations.orgconfigs.orgconfigs_migrations import migrate_to_v1_1, migrate_to_v1_2, migrate_v0_to_v1
from src.core.events.database import get_db_session
from src.db.organization_config import OrganizationConfig
from src.db.users import PublicUser, User
from src.security.auth import get_authenticated_user

logger = logging.getLogger(__name__)


router = APIRouter()


def _require_superadmin(current_user: PublicUser):
    """Require superadmin access for dev endpoints."""
    if not hasattr(current_user, 'is_superadmin') or not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")


DEV_PROFILE_BIO = (
    "I am exploring technology, entrepreneurship, and community leadership. "
    "Through internships, volunteer projects, and personal learning experiences, "
    "I am building skills while preparing for postsecondary education and future career opportunities."
)

DEV_PROFILE_STORY = """I am exploring technology, entrepreneurship, and community leadership. Through internships, volunteer projects, and personal learning experiences, I am building skills while preparing for postsecondary education and future career opportunities.

What I'm Working On
launch a tech project that helps students
Improve my coding skills
graduate and attend my dream college"""


def _upsert_social(socials: list[dict], social_type: str, url: str) -> list[dict]:
    next_socials = [dict(social) for social in socials if isinstance(social, dict)]
    for social in next_socials:
        if social.get("type") == social_type:
            social["url"] = url
            return next_socials
    next_socials.append({"type": social_type, "url": url})
    return next_socials


def _seed_profile_payload(profile: dict | None) -> dict:
    profile = dict(profile or {})
    header = dict(profile.get("header") or {})
    socials = header.get("socials") if isinstance(header.get("socials"), list) else []
    socials = _upsert_social(socials, "instagram", "https://instagram.com/life2launch")
    socials = _upsert_social(socials, "youtube", "https://youtube.com/@life2launch")
    socials = _upsert_social(socials, "website", "https://life2launch.com")
    header["socials"] = socials
    header.setdefault(
        "coverImage",
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    )

    now = datetime.now().isoformat()
    featured = {
        "enabled": True,
        "publicVisible": True,
        "cards": [
            {
                "id": "dev-portfolio-student-planner",
                "slug": "student-planner-app",
                "url": "",
                "title": "Student Planner App",
                "subtext": "A simple web app concept that helps students track assignments, goals, and weekly priorities.",
                "body": "Designed wireframes, built a small prototype, and tested the idea with classmates to learn what would make planning easier during a busy school week.",
                "imageUrl": "",
                "textTone": "dark",
                "updatedAt": now,
                "includeButton": False,
                "actionButtonText": "",
                "actionUrl": "",
            },
            {
                "id": "dev-portfolio-community-drive",
                "slug": "community-volunteer-drive",
                "url": "",
                "title": "Community Volunteer Drive",
                "subtext": "A school service project that organized volunteers and promoted local support opportunities.",
                "body": "Helped coordinate signups, created outreach materials, and tracked participation so the team could understand what worked for future events.",
                "imageUrl": "",
                "textTone": "dark",
                "updatedAt": now,
                "includeButton": False,
                "actionButtonText": "",
                "actionUrl": "",
            },
            {
                "id": "dev-portfolio-career-interview-series",
                "slug": "career-interview-series",
                "url": "",
                "title": "Career Interview Series",
                "subtext": "Short interviews with professionals about career paths in technology, business, and community leadership.",
                "body": "Prepared questions, recorded reflections, and summarized lessons about skills, education choices, and early career opportunities.",
                "imageUrl": "",
                "textTone": "dark",
                "updatedAt": now,
                "includeButton": False,
                "actionButtonText": "",
                "actionUrl": "",
            },
        ],
    }

    timeline = [
        {
            "id": "dev-timeline-high-school",
            "category": "education",
            "title": "High School Student",
            "description": "Focused on technology, entrepreneurship, leadership, and preparing for college.",
            "startDate": "2022-08",
            "endDate": "",
            "isOngoing": True,
            "institution": "Local High School",
            "employer": "",
        },
        {
            "id": "dev-timeline-tech-internship",
            "category": "work",
            "title": "Technology Intern",
            "description": "Supported a small team with website updates, research, and user feedback notes.",
            "startDate": "2025-06",
            "endDate": "2025-08",
            "isOngoing": False,
            "employer": "Community Tech Lab",
            "institution": "",
        },
        {
            "id": "dev-timeline-youth-leadership",
            "category": "work",
            "title": "Youth Leadership Intern",
            "description": "Helped plan student workshops, welcome participants, and document program outcomes.",
            "startDate": "2024-09",
            "endDate": "2024-12",
            "isOngoing": False,
            "employer": "Local Youth Center",
            "institution": "",
        },
        {
            "id": "dev-timeline-camp-counselor",
            "category": "work",
            "title": "Summer Camp Counselor",
            "description": "Led activities, supported younger students, and practiced communication and teamwork.",
            "startDate": "2024-06",
            "endDate": "2024-08",
            "isOngoing": False,
            "employer": "City Parks Summer Camp",
            "institution": "",
        },
        {
            "id": "dev-timeline-library-assistant",
            "category": "work",
            "title": "Library Assistant",
            "description": "Helped patrons, organized materials, and supported summer reading events.",
            "startDate": "2023-06",
            "endDate": "2023-08",
            "isOngoing": False,
            "employer": "Public Library",
            "institution": "",
        },
    ]

    dev_layout_ids = {
        "dev-my-story",
        "instagramPreview",
        "achievements",
        "portfolio",
        "timeline",
    }
    preserved_layout = [
        item for item in (profile.get("layout") or [])
        if isinstance(item, dict) and item.get("id") not in dev_layout_ids and item.get("type") not in {"instagramPreview", "achievements", "portfolio", "timeline"}
    ]
    preserved_sections = [
        section for section in (profile.get("sections") or [])
        if isinstance(section, dict) and section.get("id") != "dev-my-story"
    ]

    profile.update({
        "header": header,
        "featured": featured,
        "timelineEnabled": True,
        "timelinePublicVisible": True,
        "timeline": timeline,
        "layout": [
            {
                "id": "dev-my-story",
                "type": "text",
                "grid": {"x": 0, "y": 0, "w": 3, "h": 2},
                "mobileGrid": {"x": 0, "y": 0, "w": 2, "h": 2},
            },
            {
                "id": "instagramPreview",
                "type": "instagramPreview",
                "grid": {"x": 0, "y": 2, "w": 2, "h": 2},
                "mobileGrid": {"x": 0, "y": 2, "w": 2, "h": 2},
            },
            {
                "id": "achievements",
                "type": "achievements",
                "grid": {"x": 2, "y": 2, "w": 1, "h": 2},
                "mobileGrid": {"x": 0, "y": 4, "w": 2, "h": 2},
            },
            {
                "id": "portfolio",
                "type": "portfolio",
                "grid": {"x": 0, "y": 4, "w": 3, "h": 3},
                "mobileGrid": {"x": 0, "y": 6, "w": 2, "h": 3},
            },
            {
                "id": "timeline",
                "type": "timeline",
                "grid": {"x": 0, "y": 7, "w": 3, "h": 2},
                "mobileGrid": {"x": 0, "y": 9, "w": 2, "h": 2},
            },
            *preserved_layout,
        ],
        "sections": [
            *preserved_sections,
            {
                "id": "dev-my-story",
                "type": "text",
                "title": "My Story",
                "body": DEV_PROFILE_STORY,
                "url": "",
                "mediaUrl": "",
            },
        ],
    })
    return profile


@router.get("/config")
async def config(
    current_user: PublicUser = Depends(get_authenticated_user),
):
    _require_superadmin(current_user)
    config = get_launchlms_config()
    config_dict = config.model_dump()

    # Redact sensitive values
    _redact_secrets(config_dict)
    return config_dict


def _redact_secrets(d: dict, _sensitive_keys=None):
    """Recursively redact values for keys that look like secrets."""
    if _sensitive_keys is None:
        _sensitive_keys = {
            "password", "secret", "token", "key", "api_key", "api_secret",
            "connection_string", "redis_connection_string", "database_url",
            "ingest_token", "read_token", "write_token", "webhook_secret",
            "client_secret", "private_key",
        }
    for k, v in d.items():
        if isinstance(v, dict):
            _redact_secrets(v, _sensitive_keys)
        elif isinstance(v, str) and any(s in k.lower() for s in _sensitive_keys):
            if v:
                d[k] = v[:4] + "***REDACTED***"


@router.post("/seed_profile")
async def seed_profile(
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_authenticated_user),
):
    """
    Development-only helper to populate the current user's profile with demo content.
    """
    if current_user.id is None:
        raise HTTPException(status_code=400, detail="Current user is missing an id")

    user = db_session.exec(select(User).where(User.id == current_user.id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.profile = _seed_profile_payload(user.profile if isinstance(user.profile, dict) else {})
    if not (user.bio or "").strip():
        user.bio = DEV_PROFILE_BIO
    if not (user.avatar_image or "").strip():
        user.avatar_image = "https://api.dicebear.com/9.x/notionists/svg?seed=life2launch&backgroundColor=b6e3f4,c0aede,d1d4f9"

    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    return {
        "message": "Profile seeded",
        "user": user.model_dump(exclude={"password"}),
    }


@router.post("/migrate_orgconfig_v0_to_v1")
async def migrate(
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_authenticated_user),
):
    """
    Migrate organization config from v0 to v1
    """
    _require_superadmin(current_user)
    statement = select(OrganizationConfig)
    result = db_session.exec(statement)

    for orgConfig in result:
        orgConfig.config = migrate_v0_to_v1(orgConfig.config)

        db_session.add(orgConfig)
        db_session.commit()

    return {"message": "Migration successful"}


@router.post("/migrate_orgconfig_v1_to_v1.1")
async def migratev1_1(
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_authenticated_user),
):
    """
    Migrate organization config from v1 to v1.1
    """
    _require_superadmin(current_user)
    statement = select(OrganizationConfig)
    result = db_session.exec(statement)

    for orgConfig in result:
        orgConfig.config = migrate_to_v1_1(orgConfig.config)

        db_session.add(orgConfig)
        db_session.commit()

    return {"message": "Migration successful"}

@router.post("/migrate_orgconfig_v1_to_v1.2")
async def migratev1_2(
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_authenticated_user),
):
    """
    Migrate organization config from v1 to v1.2
    """
    _require_superadmin(current_user)
    statement = select(OrganizationConfig)
    result = db_session.exec(statement)

    for orgConfig in result:
        orgConfig.config = migrate_to_v1_2(orgConfig.config)

        db_session.add(orgConfig)
        db_session.commit()

    return {"message": "Migration successful"}
