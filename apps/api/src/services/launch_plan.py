from datetime import datetime, timezone
import re
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.launch_plan import (
    LaunchPlanCanvasDefinition,
    LaunchPlanCardType,
    LaunchPlanSectionDefinition,
    LaunchPlanWorkspaceUpdate,
    UserLaunchPlanCard,
    UserLaunchPlanSection,
)
from src.db.organizations import Organization
from src.db.resources import Resource, ResourceTag, ResourceTagLink, UserSavedResource
from src.db.users import PublicUser
from src.security.org_auth import require_org_membership
from src.services.resources import _serialize_resource


PLAN_DEFINITIONS = [
    ("identity", "Identity", "Define your core values and the person you want to become.", [
        ("values-beliefs", "Values & Beliefs", "Clarify the principles that guide your choices."),
        ("interests-passions", "Interests & Passions", "Notice the topics and experiences that energize you."),
        ("strengths", "Strengths", "Name the qualities and abilities you can build on."),
        ("personal-story", "Personal Story", "Connect the experiences that have shaped who you are."),
        ("purpose-vision", "Purpose & Vision", "Describe the future and impact you want to create."),
    ]),
    ("skills", "Skills", "Master new abilities and level up your career proficiency.", [
        ("executive-functioning", "Executive Functioning", "Understand how you plan, organize, regulate, and solve problems."),
        ("employability", "Employability", "Build the practical skills that help you thrive at work."),
        ("relationships", "Relationships", "Strengthen communication, collaboration, and healthy boundaries."),
        ("academic", "Academic", "Develop strategies for learning, studying, and navigating education."),
        ("daily-living", "Daily Living", "Build confidence with routines, money, home, and self-management."),
    ]),
    ("lifestyle", "Lifestyle", "Optimize your health, routines, and daily environment.", [
        ("health-wellbeing", "Health & Wellbeing", "Design habits that support your body, mind, and energy."),
        ("relationships-community", "Relationships & Community", "Shape the connections and communities around you."),
        ("home-environment", "Home & Environment", "Create spaces that help you feel grounded and capable."),
        ("time-routines", "Time & Routines", "Build rhythms that make daily life work for you."),
        ("money-resources", "Money & Resources", "Understand the resources needed to support your life."),
    ]),
    ("path", "Path", "Chart your long-term milestones and major life transitions.", [
        ("possibilities", "Possibilities", "Explore directions that could fit the life you want."),
        ("goals", "Goals", "Turn your possibilities into meaningful outcomes."),
        ("milestones", "Milestones", "Break big goals into visible points of progress."),
        ("support-network", "Support Network", "Identify the people and systems that can help."),
        ("next-steps", "Next Steps", "Choose practical actions that move your plan forward."),
    ]),
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sanitize_notes(value: str) -> str:
    value = re.sub(r"<script[\s\S]*?>[\s\S]*?</script>", "", value, flags=re.IGNORECASE)
    value = re.sub(r"<style[\s\S]*?>[\s\S]*?</style>", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\son\w+\s*=\s*(['\"]).*?\1", "", value, flags=re.IGNORECASE)
    return re.sub(r"javascript:", "", value, flags=re.IGNORECASE)


def ensure_launch_plan_definitions(org_id: int, db_session: Session) -> None:
    now = _now()
    for canvas_index, (slug, title, description, sections) in enumerate(PLAN_DEFINITIONS):
        canvas = db_session.exec(
            select(LaunchPlanCanvasDefinition).where(
                LaunchPlanCanvasDefinition.org_id == org_id,
                LaunchPlanCanvasDefinition.slug == slug,
            )
        ).first()
        if not canvas:
            canvas = LaunchPlanCanvasDefinition(
                canvas_uuid=f"launchplan_canvas_{uuid4()}",
                org_id=org_id,
                slug=slug,
                title=title,
                description=description,
                sort_order=canvas_index,
                creation_date=now,
                update_date=now,
            )
            db_session.add(canvas)
            db_session.flush()
        for section_index, (section_slug, section_title, section_description) in enumerate(sections):
            section = db_session.exec(
                select(LaunchPlanSectionDefinition).where(
                    LaunchPlanSectionDefinition.canvas_id == canvas.id,
                    LaunchPlanSectionDefinition.slug == section_slug,
                )
            ).first()
            if section:
                tag = db_session.get(ResourceTag, section.resource_tag_id)
                expected_tag_name = f"{canvas.title} / {section.title}"
                if tag and tag.name != expected_tag_name:
                    tag.name = expected_tag_name
                    tag.update_date = now
                    db_session.add(tag)
                continue
            tag_name = f"{canvas.title} / {section_title}"
            tag = db_session.exec(
                select(ResourceTag).where(
                    ResourceTag.org_id == org_id,
                    func.lower(ResourceTag.name) == tag_name.lower(),
                )
            ).first()
            if not tag:
                tag = ResourceTag(
                    org_id=org_id,
                    tag_uuid=f"resourcetag_{uuid4()}",
                    name=tag_name,
                    managed=True,
                    managed_source="launch_plan_section",
                    managed_source_uuid=None,
                    creation_date=now,
                    update_date=now,
                )
                db_session.add(tag)
                db_session.flush()
            else:
                tag.managed = True
                tag.managed_source = "launch_plan_section"
                tag.update_date = now
                db_session.add(tag)
            section = LaunchPlanSectionDefinition(
                section_uuid=f"launchplan_section_{uuid4()}",
                canvas_id=canvas.id or 0,
                resource_tag_id=tag.id or 0,
                slug=section_slug,
                title=section_title,
                description=section_description,
                explanation=f"{section_description} Use this space to collect what you learn, reflect in your own words, and connect useful resource outcomes.",
                sort_order=section_index,
                creation_date=now,
                update_date=now,
            )
            db_session.add(section)
            db_session.flush()
            tag.managed_source_uuid = section.section_uuid
            db_session.add(tag)
    db_session.commit()


def ensure_all_launch_plan_definitions(db_session: Session) -> None:
    for org_id in db_session.exec(select(Organization.id)).all():
        ensure_launch_plan_definitions(org_id, db_session)


def _get_canvas(org_id: int, slug: str, db_session: Session) -> LaunchPlanCanvasDefinition:
    ensure_launch_plan_definitions(org_id, db_session)
    canvas = db_session.exec(
        select(LaunchPlanCanvasDefinition).where(
            LaunchPlanCanvasDefinition.org_id == org_id,
            LaunchPlanCanvasDefinition.slug == slug,
        )
    ).first()
    if not canvas:
        raise HTTPException(status_code=404, detail="Launch Plan canvas not found")
    return canvas


def _get_section(org_id: int, section_uuid: str, db_session: Session) -> LaunchPlanSectionDefinition:
    section = db_session.exec(
        select(LaunchPlanSectionDefinition)
        .join(LaunchPlanCanvasDefinition, LaunchPlanCanvasDefinition.id == LaunchPlanSectionDefinition.canvas_id)
        .where(LaunchPlanCanvasDefinition.org_id == org_id, LaunchPlanSectionDefinition.section_uuid == section_uuid)
    ).first()
    if not section:
        raise HTTPException(status_code=404, detail="Launch Plan section not found")
    return section


def _user_section(user_id: int, org_id: int, section_id: int, db_session: Session, create: bool = False):
    state = db_session.exec(
        select(UserLaunchPlanSection).where(
            UserLaunchPlanSection.user_id == user_id,
            UserLaunchPlanSection.org_id == org_id,
            UserLaunchPlanSection.section_id == section_id,
        )
    ).first()
    if not state and create:
        state = UserLaunchPlanSection(
            user_id=user_id,
            org_id=org_id,
            section_id=section_id,
            notes="",
            creation_date=_now(),
            update_date=_now(),
        )
        db_session.add(state)
        db_session.flush()
    return state


def _card_read(card: UserLaunchPlanCard, user_id: int, db_session: Session) -> dict:
    payload = {
        "card_uuid": card.card_uuid,
        "card_type": card.card_type,
        "source_uuid": card.source_uuid,
        "grid": card.grid or {},
    }
    if card.card_type == LaunchPlanCardType.resource_outcome:
        resource = db_session.exec(select(Resource).where(Resource.resource_uuid == card.source_uuid)).first()
        if resource:
            state = db_session.exec(
                select(UserSavedResource).where(
                    UserSavedResource.user_id == user_id,
                    UserSavedResource.resource_id == resource.id,
                )
            ).first()
            payload["source"] = {
                "title": resource.title,
                "outcome_text": state.outcome_text if state else None,
                "outcome_link": state.outcome_link if state else None,
                "outcome_file": state.outcome_file if state else None,
            }
    return payload


def _card_summary(card: UserLaunchPlanCard, user_id: int, db_session: Session) -> dict:
    source = _card_read(card, user_id, db_session).get("source") or {}
    return {
        "card_uuid": card.card_uuid,
        "title": source.get("title") or "Resource outcome",
        "outcome_text": source.get("outcome_text"),
        "outcome_link": source.get("outcome_link"),
        "outcome_file": source.get("outcome_file"),
    }


async def list_canvases(user: PublicUser, org_id: int, db_session: Session) -> list[dict]:
    require_org_membership(user.id, org_id, db_session)
    ensure_launch_plan_definitions(org_id, db_session)
    canvases = db_session.exec(
        select(LaunchPlanCanvasDefinition).where(LaunchPlanCanvasDefinition.org_id == org_id).order_by(LaunchPlanCanvasDefinition.sort_order)
    ).all()
    result = []
    for canvas in canvases:
        sections = db_session.exec(
            select(LaunchPlanSectionDefinition).where(LaunchPlanSectionDefinition.canvas_id == canvas.id).order_by(LaunchPlanSectionDefinition.sort_order)
        ).all()
        section_rows = []
        for section in sections:
            state = _user_section(user.id, org_id, section.id or 0, db_session)
            card_count = 0
            card_summaries = []
            if state:
                cards = db_session.exec(
                    select(UserLaunchPlanCard)
                    .where(UserLaunchPlanCard.user_section_id == state.id)
                    .order_by(UserLaunchPlanCard.update_date.desc())
                ).all()
                card_count = len(cards)
                card_summaries = [_card_summary(card, user.id, db_session) for card in cards[:3]]
            section_rows.append({
                "section_uuid": section.section_uuid,
                "slug": section.slug,
                "title": section.title,
                "description": section.description,
                "explanation": section.explanation,
                "notes": state.notes if state else "",
                "intro_seen_at": state.intro_seen_at if state else None,
                "card_count": card_count,
                "card_summaries": card_summaries,
            })
        result.append({
            "canvas_uuid": canvas.canvas_uuid,
            "slug": canvas.slug,
            "title": canvas.title,
            "description": canvas.description,
            "sections": section_rows,
        })
    return result


async def get_workspace(user: PublicUser, org_id: int, section_uuid: str, db_session: Session) -> dict:
    require_org_membership(user.id, org_id, db_session)
    ensure_launch_plan_definitions(org_id, db_session)
    section = _get_section(org_id, section_uuid, db_session)
    canvas = db_session.get(LaunchPlanCanvasDefinition, section.canvas_id)
    state = _user_section(user.id, org_id, section.id or 0, db_session, create=True)
    db_session.commit()
    db_session.refresh(state)
    tag = db_session.get(ResourceTag, section.resource_tag_id)
    resources = db_session.exec(
        select(Resource)
        .join(ResourceTagLink, Resource.id == ResourceTagLink.resource_id)
        .where(ResourceTagLink.tag_id == section.resource_tag_id)
        .order_by(Resource.title)
    ).all()
    cards = db_session.exec(select(UserLaunchPlanCard).where(UserLaunchPlanCard.user_section_id == state.id)).all()
    return {
        "section": {
            "section_uuid": section.section_uuid,
            "canvas_slug": canvas.slug if canvas else "",
            "canvas_title": canvas.title if canvas else "",
            "title": section.title,
            "description": section.description,
            "explanation": section.explanation,
            "resource_tag_uuid": tag.tag_uuid if tag else None,
        },
        "notes": state.notes or "",
        "intro_seen_at": state.intro_seen_at,
        "cards": [_card_read(card, user.id, db_session) for card in cards],
        "resources": [_serialize_resource(resource, db_session, user, org_id) for resource in resources],
    }


async def mark_intro_seen(user: PublicUser, org_id: int, section_uuid: str, db_session: Session) -> dict:
    require_org_membership(user.id, org_id, db_session)
    section = _get_section(org_id, section_uuid, db_session)
    state = _user_section(user.id, org_id, section.id or 0, db_session, create=True)
    state.intro_seen_at = state.intro_seen_at or _now()
    state.update_date = _now()
    db_session.add(state)
    db_session.commit()
    return {"intro_seen_at": state.intro_seen_at}


async def update_workspace(user: PublicUser, org_id: int, section_uuid: str, data: LaunchPlanWorkspaceUpdate, db_session: Session) -> dict:
    require_org_membership(user.id, org_id, db_session)
    section = _get_section(org_id, section_uuid, db_session)
    state = _user_section(user.id, org_id, section.id or 0, db_session, create=True)
    seen_sources: set[tuple[str, str]] = set()
    for card in data.cards:
        key = (card.card_type.value, card.source_uuid)
        if key in seen_sources:
            raise HTTPException(status_code=400, detail="Duplicate Launch Plan card")
        seen_sources.add(key)
        if card.card_type != LaunchPlanCardType.resource_outcome:
            raise HTTPException(status_code=400, detail="Unsupported Launch Plan card type")
        resource = db_session.exec(select(Resource).where(Resource.resource_uuid == card.source_uuid)).first()
        resource_tag_link = db_session.exec(
            select(ResourceTagLink).where(
                ResourceTagLink.resource_id == (resource.id if resource else -1),
                ResourceTagLink.tag_id == section.resource_tag_id,
            )
        ).first()
        saved = db_session.exec(
            select(UserSavedResource).where(UserSavedResource.user_id == user.id, UserSavedResource.resource_id == (resource.id if resource else -1))
        ).first()
        if not resource or not resource_tag_link or not saved or not (saved.outcome_text or saved.outcome_link or saved.outcome_file):
            raise HTTPException(status_code=400, detail="Resource outcome is not available")
    existing = db_session.exec(select(UserLaunchPlanCard).where(UserLaunchPlanCard.user_section_id == state.id)).all()
    existing_by_key = {(card.card_type.value, card.source_uuid): card for card in existing}
    for old in existing:
        if (old.card_type.value, old.source_uuid) not in seen_sources:
            db_session.delete(old)
    for card_data in data.cards:
        key = (card_data.card_type.value, card_data.source_uuid)
        card = existing_by_key.get(key)
        if not card:
            card = UserLaunchPlanCard(
                card_uuid=f"launchplan_card_{uuid4()}",
                user_section_id=state.id or 0,
                card_type=card_data.card_type,
                source_uuid=card_data.source_uuid,
                creation_date=_now(),
                update_date=_now(),
            )
        card.grid = card_data.grid
        card.update_date = _now()
        db_session.add(card)
    state.notes = _sanitize_notes(data.notes)
    state.update_date = _now()
    db_session.add(state)
    db_session.commit()
    return await get_workspace(user, org_id, section_uuid, db_session)
