from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.courses.chapter_activities import ChapterActivity
from src.db.courses.courses import Course
from src.db.organizations import Organization
from src.db.suggested_actions import (
    SuggestedAction,
    SuggestedActionEventCreate,
    SuggestedActionEventType,
    SuggestedActionKind,
    SuggestedActionState,
)
from src.db.trail_runs import StatusEnum, TrailRun
from src.db.trail_steps import TrailStep
from src.db.trails import Trail
from src.db.users import PublicUser, User


DEFAULT_DISMISS_DAYS = 30
MAX_LIMIT = 12


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def course_image_url(org: Organization, course: Course) -> str | None:
    if not course.thumbnail_image:
        return None
    return f"/content/orgs/{org.org_uuid}/courses/{course.course_uuid}/thumbnails/{course.thumbnail_image}"


@dataclass
class SuggestedActionContext:
    user: PublicUser
    org: Organization
    db_session: Session
    surface: str
    slot: str


class SuggestedActionProvider(Protocol):
    source: str

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        ...

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        metadata: dict,
    ) -> bool:
        ...


class ContinueLearningProvider:
    source = "continue_learning"

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        metadata: dict,
    ) -> bool:
        return False

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        trail = context.db_session.exec(
            select(Trail).where(
                Trail.org_id == context.org.id,
                Trail.user_id == context.user.id,
            )
        ).first()
        if not trail:
            return []

        rows = context.db_session.exec(
            select(TrailRun, Course)
            .join(Course, TrailRun.course_id == Course.id)
            .where(
                TrailRun.trail_id == trail.id,
                TrailRun.user_id == context.user.id,
                TrailRun.org_id == context.org.id,
            )
            .order_by(TrailRun.update_date.desc())
        ).all()

        candidates: list[SuggestedAction] = []
        for run, course in rows:
            if run.status == StatusEnum.STATUS_COMPLETED:
                continue

            total_steps = context.db_session.exec(
                select(func.count(ChapterActivity.id)).where(ChapterActivity.course_id == course.id)
            ).one()
            completed_steps = context.db_session.exec(
                select(func.count(TrailStep.id)).where(
                    TrailStep.trailrun_id == run.id,
                    TrailStep.user_id == context.user.id,
                    TrailStep.complete == True,  # noqa: E712
                )
            ).one()

            if total_steps and completed_steps >= total_steps:
                continue

            progress_text = ""
            if total_steps:
                progress = round((completed_steps / total_steps) * 100)
                progress_text = f"{progress}% complete. "

            candidates.append(
                SuggestedAction(
                    key=f"continue_course:{course.course_uuid}",
                    source=self.source,
                    kind=SuggestedActionKind.CONTINUE_LEARNING,
                    title=f"Continue {course.name}",
                    subtext=f"{progress_text}Pick up where you left off.",
                    href=f"/course/{course.course_uuid}",
                    imageUrl=course_image_url(context.org, course),
                    priority=1000 + int(completed_steps),
                    dismissible=True,
                    metadata={
                        "course_uuid": course.course_uuid,
                        "course_id": course.id,
                        "completed_steps": completed_steps,
                        "total_steps": total_steps,
                    },
                )
            )

        return candidates


class ProfileCompletionProvider:
    source = "profile_completion"

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        metadata: dict,
    ) -> bool:
        return False

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        user = context.db_session.exec(select(User).where(User.id == context.user.id)).first()
        if not user:
            return []

        candidates: list[SuggestedAction] = []
        if not user.avatar_image:
            candidates.append(
                SuggestedAction(
                    key="profile:add_avatar",
                    source=self.source,
                    kind=SuggestedActionKind.PROFILE_COMPLETION,
                    title="Add your profile photo",
                    subtext="Help people recognize you across courses and community spaces.",
                    href="/profile/edit",
                    priority=800,
                    dismissible=True,
                )
            )

        if not (user.bio or "").strip():
            candidates.append(
                SuggestedAction(
                    key="profile:add_bio",
                    source=self.source,
                    kind=SuggestedActionKind.PROFILE_COMPLETION,
                    title="Write a short bio",
                    subtext="Give your profile a little context for collaborators and instructors.",
                    href="/profile/edit",
                    priority=760,
                    dismissible=True,
                )
            )

        profile = user.profile or {}
        sections = profile.get("sections") if isinstance(profile, dict) else None
        has_identity_content = bool(sections) or bool(profile.get("header") if isinstance(profile, dict) else None)
        if not has_identity_content:
            candidates.append(
                SuggestedAction(
                    key="profile:complete_identity",
                    source=self.source,
                    kind=SuggestedActionKind.PROFILE_COMPLETION,
                    title="Shape your identity",
                    subtext="Start filling out the profile details that tell your learning story.",
                    href="/profile/edit",
                    priority=720,
                    dismissible=True,
                )
            )

        return candidates


class ContentDiscoveryProvider:
    source = "content_discovery"

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        metadata: dict,
    ) -> bool:
        return False

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        in_progress_course_ids = set(
            context.db_session.exec(
                select(TrailRun.course_id).where(
                    TrailRun.org_id == context.org.id,
                    TrailRun.user_id == context.user.id,
                )
            ).all()
        )

        courses = context.db_session.exec(
            select(Course)
            .where(
                Course.org_id == context.org.id,
                Course.published == True,  # noqa: E712
                Course.public == True,  # noqa: E712
            )
            .order_by(Course.creation_date.desc())
            .limit(8)
        ).all()

        candidates: list[SuggestedAction] = []
        for index, course in enumerate(courses):
            if course.id in in_progress_course_ids:
                continue
            candidates.append(
                SuggestedAction(
                    key=f"discover_course:{course.course_uuid}",
                    source=self.source,
                    kind=SuggestedActionKind.CONTENT_DISCOVERY,
                    title=f"Explore {course.name}",
                    subtext=course.description or "Discover something new from this organization.",
                    href=f"/course/{course.course_uuid}",
                    imageUrl=course_image_url(context.org, course),
                    priority=600 - index,
                    dismissible=True,
                    metadata={
                        "course_uuid": course.course_uuid,
                        "course_id": course.id,
                    },
                )
            )

        return candidates


class OnboardingProvider:
    source = "onboarding"

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        metadata: dict,
    ) -> bool:
        if event_type != SuggestedActionEventType.CLICKED:
            return False
        return action_key in {
            "onboarding:visit_courses",
            "onboarding:visit_profile",
        }

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        return [
            SuggestedAction(
                key="onboarding:visit_courses",
                source=self.source,
                kind=SuggestedActionKind.ONBOARDING,
                title="Browse the course catalog",
                subtext="Get a feel for what this space offers and find a good next step.",
                href="/courses",
                priority=400,
                dismissible=True,
            ),
            SuggestedAction(
                key="onboarding:visit_profile",
                source=self.source,
                kind=SuggestedActionKind.ONBOARDING,
                title="Visit your profile",
                subtext="Your profile is where achievements, reflections, and identity come together.",
                href="/profile",
                priority=360,
                dismissible=True,
            ),
        ]


class AnnouncementProvider:
    source = "announcement"

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        metadata: dict,
    ) -> bool:
        return False

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        return []


class ScaffoldedPathProvider:
    source = "scaffolded_path"

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        metadata: dict,
    ) -> bool:
        return False

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        return []


class SuggestedActionService:
    def __init__(self, providers: list[SuggestedActionProvider] | None = None):
        self.providers = providers or [
            ContinueLearningProvider(),
            ProfileCompletionProvider(),
            ContentDiscoveryProvider(),
            OnboardingProvider(),
            AnnouncementProvider(),
            ScaffoldedPathProvider(),
        ]

    def get_actions(
        self,
        context: SuggestedActionContext,
        limit: int = 3,
    ) -> list[SuggestedAction]:
        limit = min(max(limit, 1), MAX_LIMIT)
        candidates: list[SuggestedAction] = []
        for provider in self.providers:
            candidates.extend(provider.get_candidates(context))

        states = self._get_states(context, [candidate.key for candidate in candidates])
        filtered = [
            candidate for candidate in candidates
            if not self._is_suppressed(candidate, states.get(candidate.key))
        ]
        filtered.sort(key=lambda candidate: candidate.priority, reverse=True)
        return self._diversify(filtered, limit)

    def _get_states(
        self,
        context: SuggestedActionContext,
        action_keys: list[str],
    ) -> dict[str, SuggestedActionState]:
        if not action_keys:
            return {}

        states = context.db_session.exec(
            select(SuggestedActionState).where(
                SuggestedActionState.user_id == context.user.id,
                SuggestedActionState.org_id == context.org.id,
                SuggestedActionState.surface == context.surface,
                SuggestedActionState.action_key.in_(action_keys),  # type: ignore[attr-defined]
            )
        ).all()
        return {state.action_key: state for state in states}

    def _is_suppressed(
        self,
        candidate: SuggestedAction,
        state: SuggestedActionState | None,
    ) -> bool:
        if not state:
            return False
        if state.completed_at:
            return True

        dismissed_until = parse_iso(state.dismissed_until)
        if dismissed_until and dismissed_until > datetime.now(timezone.utc):
            return True

        expires_at = parse_iso(candidate.expiresAt)
        if expires_at and expires_at <= datetime.now(timezone.utc):
            return True

        return False

    def _diversify(
        self,
        candidates: list[SuggestedAction],
        limit: int,
    ) -> list[SuggestedAction]:
        selected: list[SuggestedAction] = []
        deferred = candidates.copy()
        used_sources: set[str] = set()

        for candidate in candidates:
            if len(selected) >= limit:
                return selected
            if candidate.source in used_sources:
                continue
            selected.append(candidate)
            used_sources.add(candidate.source)
            deferred.remove(candidate)

        for candidate in deferred:
            if len(selected) >= limit:
                break
            selected.append(candidate)

        return selected

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        metadata: dict | None = None,
    ) -> bool:
        event_metadata = metadata or {}
        return any(
            provider.completes_on_event(action_key, event_type, event_metadata)
            for provider in self.providers
        )


def get_org_or_404(org_id: int, db_session: Session) -> Organization:
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


async def get_suggested_actions(
    *,
    user: PublicUser,
    org_id: int,
    surface: str,
    slot: str,
    limit: int,
    db_session: Session,
) -> list[SuggestedAction]:
    org = get_org_or_404(org_id, db_session)
    context = SuggestedActionContext(
        user=user,
        org=org,
        db_session=db_session,
        surface=surface or "global",
        slot=slot or "primary",
    )
    return SuggestedActionService().get_actions(context, limit=limit)


async def record_suggested_action_event(
    *,
    user: PublicUser,
    org_id: int,
    event: SuggestedActionEventCreate,
    db_session: Session,
) -> SuggestedActionState:
    get_org_or_404(org_id, db_session)
    surface = event.surface or "global"
    now = now_iso()
    state = db_session.exec(
        select(SuggestedActionState).where(
            SuggestedActionState.user_id == user.id,
            SuggestedActionState.org_id == org_id,
            SuggestedActionState.action_key == event.action_key,
            SuggestedActionState.surface == surface,
        )
    ).first()

    if not state:
        state = SuggestedActionState(
            user_id=user.id,
            org_id=org_id,
            action_key=event.action_key,
            surface=surface,
            metadata_json={},
            creation_date=now,
            update_date=now,
        )

    state.update_date = now
    state.metadata_json = {**(state.metadata_json or {}), **(event.metadata or {})}

    if event.event_type == SuggestedActionEventType.VIEWED:
        state.last_seen_at = now
        state.view_count = (state.view_count or 0) + 1
    elif event.event_type == SuggestedActionEventType.CLICKED:
        state.last_clicked_at = now
        state.click_count = (state.click_count or 0) + 1
        if SuggestedActionService().completes_on_event(
            event.action_key,
            event.event_type,
            event.metadata,
        ):
            state.completed_at = now
    elif event.event_type == SuggestedActionEventType.DISMISSED:
        state.dismissed_until = (datetime.now(timezone.utc) + timedelta(days=DEFAULT_DISMISS_DAYS)).isoformat()
    elif event.event_type == SuggestedActionEventType.COMPLETED:
        state.completed_at = now

    db_session.add(state)
    db_session.commit()
    db_session.refresh(state)
    return state
