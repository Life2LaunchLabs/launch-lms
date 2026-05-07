from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.communities.communities import Community
from src.db.communities.discussion_comments import DiscussionComment
from src.db.communities.discussions import Discussion
from src.db.courses.chapter_activities import ChapterActivity
from src.db.courses.courses import Course
from src.db.organizations import Organization
from src.db.resources import Resource, ResourceChannel, ResourceChannelResource
from src.db.suggested_actions import (
    SuggestedAction,
    SuggestedActionBadgeKind,
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
RECENT_CONTENT_DAYS = 30
MAX_LIMIT = 20


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def is_recent_iso(value: str | None, *, days: int = RECENT_CONTENT_DAYS) -> bool:
    parsed = parse_iso(value)
    if not parsed:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed >= datetime.now(timezone.utc) - timedelta(days=days)


def course_image_url(org: Organization, course: Course) -> str | None:
    if not course.thumbnail_image:
        return None
    return f"/content/orgs/{org.org_uuid}/courses/{course.course_uuid}/thumbnails/{course.thumbnail_image}"


def resource_image_url(org: Organization, resource: Resource) -> str | None:
    if resource.cover_image_url:
        return resource.cover_image_url
    if not resource.thumbnail_image:
        return None
    return f"/content/orgs/{org.org_uuid}/resources/{resource.resource_uuid}/thumbnails/{resource.thumbnail_image}"


def route_matches(route_path: str | None, target_href: str) -> bool:
    if not route_path:
        return False
    normalized_route = route_path.rstrip("/") or "/"
    normalized_target = target_href.rstrip("/") or "/"
    return (
        normalized_route == normalized_target
        or normalized_route.endswith(normalized_target)
        or normalized_route.startswith(f"{normalized_target}/")
        or f"{normalized_target}/" in normalized_route
    )


@dataclass
class SuggestedActionContext:
    user: PublicUser
    org: Organization
    db_session: Session
    surface: str
    slot: str
    context: str | None = None


class SuggestedActionProvider(Protocol):
    source: str

    def supports_surface(self, surface: str, slot: str, context: str | None = None) -> bool:
        ...

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        ...

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        surface: str,
        context: str | None,
        metadata: dict,
    ) -> bool:
        ...


class JourneyOnlyProvider:
    def supports_surface(self, surface: str, slot: str, context: str | None = None) -> bool:
        return surface == "journey" and slot == "primary"


class ContinueLearningProvider(JourneyOnlyProvider):
    source = "continue_learning"

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        surface: str,
        context: str | None,
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
                    targetHref="/courses",
                    surface=context.surface,
                    slot=context.slot,
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


class ProfileCompletionProvider(JourneyOnlyProvider):
    source = "profile_completion"

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        surface: str,
        context: str | None,
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
                    targetHref="/profile",
                    surface=context.surface,
                    slot=context.slot,
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
                    targetHref="/profile",
                    surface=context.surface,
                    slot=context.slot,
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
                    targetHref="/profile",
                    surface=context.surface,
                    slot=context.slot,
                    priority=720,
                    dismissible=True,
                )
            )

        return candidates


class ContentDiscoveryProvider(JourneyOnlyProvider):
    source = "content_discovery"

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        surface: str,
        context: str | None,
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
                    targetHref="/courses",
                    surface=context.surface,
                    slot=context.slot,
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
    features = {
        "courses": {
            "href": "/courses",
            "visit_key": "onboarding:visit_courses",
            "banner_key": "onboarding:courses_feature_intro",
            "journey_title": "Browse the course catalog",
            "journey_subtext": "Get a feel for what this space offers and find a good next step.",
            "banner_title": "Dive into our curated collection of courses.",
            "banner_subtext": "Gain skills, learn about yourself, and plan your target lifestyle.",
            "priority": 400,
        },
        "communities": {
            "href": "/communities",
            "visit_key": "onboarding:visit_communities",
            "banner_key": "onboarding:communities_feature_intro",
            "journey_title": "Visit the community spaces",
            "journey_subtext": "See where conversation, questions, and shared progress are happening.",
            "banner_title": "Connect with other launchers.",
            "banner_subtext": "Got a question, resource to share, or just looking to chat? You're in the right place.",
            "priority": 390,
        },
        "resources": {
            "href": "/resources",
            "visit_key": "onboarding:visit_resources",
            "banner_key": "onboarding:resources_feature_intro",
            "journey_title": "Explore the resource library",
            "journey_subtext": "Find guides, tools, and support material that can help right now.",
            "banner_title": "All the resources you need in one place.",
            "banner_subtext": "Quickly find any information, tools, and support you need for life launching.",
            "priority": 380,
        },
    }

    def supports_surface(self, surface: str, slot: str, context: str | None = None) -> bool:
        if surface == "journey" and slot == "primary":
            return True
        if surface == "nav" and slot == "badge":
            return True
        if surface == "route" and slot == "tracker":
            return True
        return surface == "feature_page" and slot == "banner" and context in self.features

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        surface: str,
        context: str | None,
        metadata: dict,
    ) -> bool:
        route_path = metadata.get("route_path")
        for feature in self.features.values():
            if action_key == feature["visit_key"]:
                if event_type == SuggestedActionEventType.CLICKED:
                    return True
                return event_type == SuggestedActionEventType.ROUTE_VISITED and route_matches(route_path, feature["href"])

            if action_key == feature["banner_key"]:
                return event_type == SuggestedActionEventType.DISMISSED

        if action_key == "onboarding:visit_profile":
            if event_type == SuggestedActionEventType.CLICKED:
                return True
            return event_type == SuggestedActionEventType.ROUTE_VISITED and route_matches(route_path, "/profile")

        return False

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        if context.surface == "feature_page":
            feature = self.features.get(context.context or "")
            if not feature:
                return []
            return [
                SuggestedAction(
                    key=feature["banner_key"],
                    source=self.source,
                    kind=SuggestedActionKind.ONBOARDING,
                    title=feature["banner_title"],
                    subtext=feature["banner_subtext"],
                    href=feature["href"],
                    targetHref=feature["href"],
                    surface=context.surface,
                    slot=context.slot,
                    context=context.context,
                    priority=feature["priority"],
                    dismissible=True,
                )
            ]

        if context.surface == "nav":
            return [
                SuggestedAction(
                    key=feature["visit_key"],
                    source=self.source,
                    kind=SuggestedActionKind.ONBOARDING,
                    title=feature["journey_title"],
                    subtext=feature["journey_subtext"],
                    href=feature["href"],
                    targetHref=feature["href"],
                    surface=context.surface,
                    slot=context.slot,
                    context=feature_key,
                    badgeCount=1,
                    badgeKind=SuggestedActionBadgeKind.DOT,
                    priority=feature["priority"],
                    dismissible=False,
                )
                for feature_key, feature in self.features.items()
            ]

        journey_actions = [
            SuggestedAction(
                key=feature["visit_key"],
                source=self.source,
                kind=SuggestedActionKind.ONBOARDING,
                title=feature["journey_title"],
                subtext=feature["journey_subtext"],
                href=feature["href"],
                targetHref=feature["href"],
                surface=context.surface,
                slot=context.slot,
                context=feature_key,
                priority=feature["priority"],
                dismissible=True,
            )
            for feature_key, feature in self.features.items()
        ]
        journey_actions.append(
            SuggestedAction(
                key="onboarding:visit_profile",
                source=self.source,
                kind=SuggestedActionKind.ONBOARDING,
                title="Visit your profile",
                subtext="Your profile is where achievements, reflections, and identity come together.",
                href="/profile",
                targetHref="/profile",
                surface=context.surface,
                slot=context.slot,
                context="profile",
                priority=360,
                dismissible=True,
            )
        )
        if context.surface == "route":
            return [
                action.model_copy(update={"surface": context.surface, "slot": context.slot, "dismissible": False})
                for action in journey_actions
            ]
        return journey_actions


class NewContentProvider:
    source = "new_content"

    def supports_surface(self, surface: str, slot: str, context: str | None = None) -> bool:
        return (surface == "journey" and slot == "primary") or (surface == "nav" and slot == "badge")

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        surface: str,
        context: str | None,
        metadata: dict,
    ) -> bool:
        if not action_key.startswith("new_content:"):
            return False
        if event_type == SuggestedActionEventType.CLICKED:
            return True
        if event_type != SuggestedActionEventType.ROUTE_VISITED:
            return False

        target_href = metadata.get("target_href")
        route_path = metadata.get("route_path")
        return isinstance(target_href, str) and route_matches(route_path, target_href)

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        return [
            *self._course_candidates(context),
            *self._resource_candidates(context),
        ]

    def _course_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        courses = context.db_session.exec(
            select(Course)
            .where(
                Course.org_id == context.org.id,
                Course.published == True,  # noqa: E712
                Course.public == True,  # noqa: E712
            )
            .order_by(Course.creation_date.desc())
            .limit(3)
        ).all()

        return [
            SuggestedAction(
                key=f"new_content:course:{course.course_uuid}",
                source=self.source,
                kind=SuggestedActionKind.NEW_CONTENT,
                title=f"New course: {course.name}",
                subtext=course.description or "A new course is available in the catalog.",
                href=f"/course/{course.course_uuid}",
                targetHref="/courses",
                surface=context.surface,
                slot=context.slot,
                context="courses",
                imageUrl=course_image_url(context.org, course),
                badgeCount=1 if context.surface == "nav" else None,
                badgeKind=SuggestedActionBadgeKind.DOT,
                priority=700,
                dismissible=True,
                metadata={"course_uuid": course.course_uuid, "course_id": course.id},
            )
            for course in courses
            if is_recent_iso(course.creation_date)
        ]

    def _resource_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        resources = context.db_session.exec(
            select(Resource)
            .join(ResourceChannelResource, ResourceChannelResource.resource_id == Resource.id)
            .join(ResourceChannel, ResourceChannel.id == ResourceChannelResource.channel_id)
            .where(
                Resource.org_id == context.org.id,
                Resource.is_live == True,  # noqa: E712
                ResourceChannel.public == True,  # noqa: E712
            )
            .group_by(Resource.id)
            .order_by(Resource.creation_date.desc())
            .limit(3)
        ).all()

        return [
            SuggestedAction(
                key=f"new_content:resource:{resource.resource_uuid}",
                source=self.source,
                kind=SuggestedActionKind.NEW_CONTENT,
                title=f"New resource: {resource.title}",
                subtext=resource.description or "A new resource is available in the library.",
                href=f"/resources/{resource.resource_uuid}",
                targetHref="/resources",
                surface=context.surface,
                slot=context.slot,
                context="resources",
                imageUrl=resource_image_url(context.org, resource),
                badgeCount=1 if context.surface == "nav" else None,
                badgeKind=SuggestedActionBadgeKind.DOT,
                priority=690,
                dismissible=True,
                metadata={"resource_uuid": resource.resource_uuid, "resource_id": resource.id},
            )
            for resource in resources
            if is_recent_iso(resource.creation_date)
        ]


class CommunityActivityProvider:
    source = "community_activity"

    def supports_surface(self, surface: str, slot: str, context: str | None = None) -> bool:
        return (surface == "journey" and slot == "primary") or (surface == "nav" and slot == "badge")

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        surface: str,
        context: str | None,
        metadata: dict,
    ) -> bool:
        if not action_key.startswith("community_activity:"):
            return False
        if event_type == SuggestedActionEventType.CLICKED:
            return True
        if event_type != SuggestedActionEventType.ROUTE_VISITED:
            return False
        route_path = metadata.get("route_path")
        target_href = metadata.get("target_href") or "/communities"
        return isinstance(target_href, str) and route_matches(route_path, target_href)

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        involved_community_ids = self._involved_community_ids(context)
        if not involved_community_ids:
            return []

        discussions = context.db_session.exec(
            select(Discussion, Community)
            .join(Community, Community.id == Discussion.community_id)
            .where(
                Discussion.org_id == context.org.id,
                Discussion.community_id.in_(involved_community_ids),  # type: ignore[attr-defined]
                Discussion.author_id != context.user.id,
            )
            .order_by(Discussion.update_date.desc())
            .limit(3)
        ).all()
        if not discussions:
            return []

        if context.surface == "nav":
            return [
                SuggestedAction(
                    key="community_activity:communities",
                    source=self.source,
                    kind=SuggestedActionKind.COMMUNITY_ACTIVITY,
                    title="New community activity",
                    subtext="There are new posts in communities you have joined.",
                    href="/communities",
                    targetHref="/communities",
                    surface=context.surface,
                    slot=context.slot,
                    context="communities",
                    badgeCount=len(discussions),
                    badgeKind=SuggestedActionBadgeKind.COUNT,
                    priority=1100,
                    dismissible=False,
                )
            ]

        return [
            SuggestedAction(
                key=f"community_activity:discussion:{discussion.discussion_uuid}",
                source=self.source,
                kind=SuggestedActionKind.COMMUNITY_ACTIVITY,
                title=f"New discussion in {community.name}",
                subtext=discussion.title,
                href=f"/community/{community.community_uuid}/discussion/{discussion.discussion_uuid}",
                targetHref="/communities",
                surface=context.surface,
                slot=context.slot,
                context="communities",
                priority=1100 - index,
                dismissible=True,
                metadata={
                    "community_uuid": community.community_uuid,
                    "discussion_uuid": discussion.discussion_uuid,
                    "discussion_id": discussion.id,
                },
            )
            for index, (discussion, community) in enumerate(discussions)
        ]

    def _involved_community_ids(self, context: SuggestedActionContext) -> list[int]:
        authored_discussion_community_ids = context.db_session.exec(
            select(Discussion.community_id).where(
                Discussion.org_id == context.org.id,
                Discussion.author_id == context.user.id,
            )
        ).all()

        commented_community_ids = context.db_session.exec(
            select(Discussion.community_id)
            .join(DiscussionComment, DiscussionComment.discussion_id == Discussion.id)
            .where(
                Discussion.org_id == context.org.id,
                DiscussionComment.author_id == context.user.id,
            )
        ).all()

        return list({*authored_discussion_community_ids, *commented_community_ids})


class MessagesProvider:
    source = "message"

    def supports_surface(self, surface: str, slot: str, context: str | None = None) -> bool:
        return surface == "nav" and slot == "badge"

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        surface: str,
        context: str | None,
        metadata: dict,
    ) -> bool:
        return False

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        return []


class AnnouncementProvider:
    source = "announcement"

    def supports_surface(self, surface: str, slot: str, context: str | None = None) -> bool:
        return False

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        surface: str,
        context: str | None,
        metadata: dict,
    ) -> bool:
        return False

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        return []


class ScaffoldedPathProvider:
    source = "scaffolded_path"

    def supports_surface(self, surface: str, slot: str, context: str | None = None) -> bool:
        return False

    def completes_on_event(
        self,
        action_key: str,
        event_type: SuggestedActionEventType,
        surface: str,
        context: str | None,
        metadata: dict,
    ) -> bool:
        return False

    def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
        return []


class SuggestedActionService:
    def __init__(self, providers: list[SuggestedActionProvider] | None = None):
        self.providers = providers or [
            MessagesProvider(),
            CommunityActivityProvider(),
            ContinueLearningProvider(),
            ProfileCompletionProvider(),
            NewContentProvider(),
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
            supports_surface = getattr(provider, "supports_surface", None)
            if supports_surface and not supports_surface(context.surface, context.slot, context.context):
                continue
            candidates.extend(provider.get_candidates(context))

        states = self._get_states(context, [candidate.key for candidate in candidates])
        filtered = [
            candidate for candidate in candidates
            if not self._is_suppressed(candidate, states.get(candidate.key, []), context.surface)
        ]
        filtered.sort(key=lambda candidate: candidate.priority, reverse=True)
        return self._diversify(filtered, limit)

    def _get_states(
        self,
        context: SuggestedActionContext,
        action_keys: list[str],
    ) -> dict[str, list[SuggestedActionState]]:
        if not action_keys:
            return {}

        states = context.db_session.exec(
            select(SuggestedActionState).where(
                SuggestedActionState.user_id == context.user.id,
                SuggestedActionState.org_id == context.org.id,
                SuggestedActionState.action_key.in_(action_keys),  # type: ignore[attr-defined]
            )
        ).all()
        states_by_key: dict[str, list[SuggestedActionState]] = {}
        for state in states:
            states_by_key.setdefault(state.action_key, []).append(state)
        return states_by_key

    def _is_suppressed(
        self,
        candidate: SuggestedAction,
        states: list[SuggestedActionState],
        surface: str,
    ) -> bool:
        if any(state.completed_at for state in states):
            return True

        expires_at = parse_iso(candidate.expiresAt)
        if expires_at and expires_at <= datetime.now(timezone.utc):
            return True

        for state in states:
            if state.surface not in {surface, "global"}:
                continue
            dismissed_until = parse_iso(state.dismissed_until)
            if dismissed_until and dismissed_until > datetime.now(timezone.utc):
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
        surface: str,
        context: str | None,
        metadata: dict | None = None,
    ) -> bool:
        event_metadata = metadata or {}
        return any(
            provider.completes_on_event(action_key, event_type, surface, context, event_metadata)
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
    context: str | None = None,
) -> list[SuggestedAction]:
    org = get_org_or_404(org_id, db_session)
    context = SuggestedActionContext(
        user=user,
        org=org,
        db_session=db_session,
        surface=surface or "global",
        slot=slot or "primary",
        context=context,
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
            surface,
            event.context,
            event.metadata,
        ):
            state.completed_at = now
    elif event.event_type == SuggestedActionEventType.DISMISSED:
        state.dismissed_until = (datetime.now(timezone.utc) + timedelta(days=DEFAULT_DISMISS_DAYS)).isoformat()
        if SuggestedActionService().completes_on_event(
            event.action_key,
            event.event_type,
            surface,
            event.context,
            event.metadata,
        ):
            state.completed_at = now
    elif event.event_type == SuggestedActionEventType.COMPLETED:
        state.completed_at = now
    elif event.event_type == SuggestedActionEventType.ROUTE_VISITED:
        if SuggestedActionService().completes_on_event(
            event.action_key,
            event.event_type,
            surface,
            event.context,
            event.metadata,
        ):
            state.completed_at = now

    db_session.add(state)
    db_session.commit()
    db_session.refresh(state)
    return state
