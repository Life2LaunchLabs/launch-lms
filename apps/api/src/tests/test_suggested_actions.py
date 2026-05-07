from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import JSON
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.courses.activities import Activity, ActivitySubTypeEnum, ActivityTypeEnum
from src.db.courses.chapter_activities import ChapterActivity
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.guest_sessions import GuestSession  # noqa: F401
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
from src.services.suggested_actions.suggested_actions import (
    ProfileCompletionProvider,
    SuggestedActionContext,
    SuggestedActionService,
    get_suggested_actions,
    record_suggested_action_event,
)


NOW = "2026-05-07T12:00:00+00:00"


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Course.__table__.c.seo.type = JSON()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def create_org(session: Session) -> Organization:
    org = Organization(
        id=1,
        org_uuid="org_1",
        name="Wayne Enterprises",
        slug="wayne",
        email="hello@wayne.dev",
        creation_date=NOW,
        update_date=NOW,
    )
    session.add(org)
    session.commit()
    return org


def create_user(session: Session, *, avatar_image: str = "", bio: str = "", profile: dict | None = None) -> User:
    user = User(
        id=1,
        user_uuid="user_1",
        username="batman",
        first_name="Bruce",
        last_name="Wayne",
        email="bruce@wayne.dev",
        avatar_image=avatar_image,
        bio=bio,
        profile=profile or {},
        details={},
        creation_date=NOW,
        update_date=NOW,
    )
    session.add(user)
    session.commit()
    return user


def public_user(user: User) -> PublicUser:
    return PublicUser.model_validate(user)


def create_course(session: Session, org: Organization, *, course_id: int, uuid: str, name: str) -> Course:
    course = Course(
        id=course_id,
        org_id=org.id or 1,
        course_uuid=uuid,
        name=name,
        description="Course description",
        about="",
        learnings="",
        tags="",
        thumbnail_image="",
        thumbnail_video="",
        public=True,
        shared=False,
        guest_access=False,
        published=True,
        coming_soon=False,
        open_to_contributors=False,
        creation_date=NOW,
        update_date=NOW,
    )
    session.add(course)
    session.commit()
    return course


def add_course_activity(session: Session, org: Organization, course: Course, *, activity_id: int, completed: bool = False) -> Activity:
    chapter = Chapter(
        id=activity_id,
        org_id=org.id or 1,
        course_id=course.id or 1,
        chapter_uuid=f"chapter_{activity_id}",
        name=f"Chapter {activity_id}",
        description="",
        thumbnail_image="",
        creation_date=NOW,
        update_date=NOW,
    )
    activity = Activity(
        id=activity_id,
        org_id=org.id or 1,
        course_id=course.id or 1,
        activity_uuid=f"activity_{activity_id}",
        name=f"Activity {activity_id}",
        activity_type=ActivityTypeEnum.TYPE_CUSTOM,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_CUSTOM,
        content={},
        details={},
        published=True,
        creation_date=NOW,
        update_date=NOW,
    )
    chapter_activity = ChapterActivity(
        id=activity_id,
        order=activity_id,
        chapter_id=chapter.id or activity_id,
        activity_id=activity.id or activity_id,
        course_id=course.id or 1,
        org_id=org.id or 1,
        creation_date=NOW,
        update_date=NOW,
    )
    session.add(chapter)
    session.add(activity)
    session.add(chapter_activity)
    session.commit()
    return activity


def add_trail_run(session: Session, org: Organization, user: User, course: Course, *, completed: bool = False) -> TrailRun:
    trail = Trail(
        id=1,
        org_id=org.id or 1,
        user_id=user.id,
        trail_uuid="trail_1",
        creation_date=NOW,
        update_date=NOW,
    )
    run = TrailRun(
        id=1,
        trail_id=trail.id or 1,
        course_id=course.id or 1,
        org_id=org.id or 1,
        user_id=user.id,
        status=StatusEnum.STATUS_COMPLETED if completed else StatusEnum.STATUS_IN_PROGRESS,
        data={},
        creation_date=NOW,
        update_date=NOW,
    )
    session.add(trail)
    session.add(run)
    session.commit()
    return run


@pytest.mark.asyncio
async def test_continue_learning_provider_returns_incomplete_course(db_session: Session):
    org = create_org(db_session)
    user = create_user(db_session, avatar_image="avatar.png", bio="Learner", profile={"sections": [{"title": "Identity"}]})
    course = create_course(db_session, org, course_id=1, uuid="course_1", name="Gotham Basics")
    activity = add_course_activity(db_session, org, course, activity_id=1)
    run = add_trail_run(db_session, org, user, course)

    actions = await get_suggested_actions(
        user=public_user(user),
        org_id=org.id or 1,
        surface="journey",
        slot="primary",
        limit=3,
        db_session=db_session,
    )

    assert actions[0].key == "continue_course:course_1"
    assert actions[0].href == "/course/course_1"
    assert actions[0].kind == "continue_learning"


@pytest.mark.asyncio
async def test_continue_learning_suppresses_completed_course(db_session: Session):
    org = create_org(db_session)
    user = create_user(db_session, avatar_image="avatar.png", bio="Learner", profile={"sections": [{"title": "Identity"}]})
    course = create_course(db_session, org, course_id=1, uuid="course_1", name="Gotham Basics")
    add_course_activity(db_session, org, course, activity_id=1)
    add_trail_run(db_session, org, user, course, completed=True)

    actions = await get_suggested_actions(
        user=public_user(user),
        org_id=org.id or 1,
        surface="journey",
        slot="primary",
        limit=6,
        db_session=db_session,
    )

    assert "continue_course:course_1" not in [action.key for action in actions]


def test_profile_provider_suppresses_completed_profile_fields(db_session: Session):
    org = create_org(db_session)
    user = create_user(db_session, avatar_image="avatar.png", bio="Learner", profile={"sections": [{"title": "Identity"}]})
    context = SuggestedActionContext(
        user=public_user(user),
        org=org,
        db_session=db_session,
        surface="journey",
        slot="primary",
    )

    actions = ProfileCompletionProvider().get_candidates(context)

    assert actions == []


@pytest.mark.asyncio
async def test_discovery_excludes_courses_already_in_progress(db_session: Session):
    org = create_org(db_session)
    user = create_user(db_session, avatar_image="avatar.png", bio="Learner", profile={"sections": [{"title": "Identity"}]})
    in_progress = create_course(db_session, org, course_id=1, uuid="course_1", name="Gotham Basics")
    fresh = create_course(db_session, org, course_id=2, uuid="course_2", name="Detective Work")
    add_trail_run(db_session, org, user, in_progress)

    actions = await get_suggested_actions(
        user=public_user(user),
        org_id=org.id or 1,
        surface="journey",
        slot="primary",
        limit=6,
        db_session=db_session,
    )

    keys = [action.key for action in actions]
    assert "discover_course:course_1" not in keys
    assert "discover_course:course_2" in keys


def test_ranking_diversifies_sources_before_duplicates(db_session: Session):
    org = create_org(db_session)
    user = create_user(db_session)
    context = SuggestedActionContext(
        user=public_user(user),
        org=org,
        db_session=db_session,
        surface="journey",
        slot="primary",
    )

    class DuplicateProvider:
        source = "duplicate"

        def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
            return [
                SuggestedAction(
                    key="duplicate:one",
                    source=self.source,
                    kind=SuggestedActionKind.ONBOARDING,
                    title="One",
                    href="/one",
                    priority=100,
                    dismissible=True,
                ),
                SuggestedAction(
                    key="duplicate:two",
                    source=self.source,
                    kind=SuggestedActionKind.ONBOARDING,
                    title="Two",
                    href="/two",
                    priority=90,
                    dismissible=True,
                ),
            ]

    class FreshProvider:
        source = "fresh"

        def get_candidates(self, context: SuggestedActionContext) -> list[SuggestedAction]:
            return [
                SuggestedAction(
                    key="fresh:one",
                    source=self.source,
                    kind=SuggestedActionKind.CONTENT_DISCOVERY,
                    title="Fresh",
                    href="/fresh",
                    priority=80,
                    dismissible=True,
                )
            ]

    actions = SuggestedActionService(providers=[DuplicateProvider(), FreshProvider()]).get_actions(context, limit=3)

    assert [action.key for action in actions] == ["duplicate:one", "fresh:one", "duplicate:two"]


@pytest.mark.asyncio
async def test_dismissed_actions_are_hidden_until_expiry(db_session: Session):
    org = create_org(db_session)
    user = create_user(db_session)
    db_session.add(
        SuggestedActionState(
            user_id=user.id or 1,
            org_id=org.id or 1,
            action_key="profile:add_avatar",
            surface="journey",
            dismissed_until=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            metadata_json={},
            creation_date=NOW,
            update_date=NOW,
        )
    )
    db_session.commit()

    actions = await get_suggested_actions(
        user=public_user(user),
        org_id=org.id or 1,
        surface="journey",
        slot="primary",
        limit=6,
        db_session=db_session,
    )

    assert "profile:add_avatar" not in [action.key for action in actions]


@pytest.mark.asyncio
async def test_event_endpoint_updates_counters_and_timestamps(db_session: Session):
    org = create_org(db_session)
    user = create_user(db_session)

    await record_suggested_action_event(
        user=public_user(user),
        org_id=org.id or 1,
        event=SuggestedActionEventCreate(
            action_key="profile:add_avatar",
            event_type=SuggestedActionEventType.VIEWED,
            surface="journey",
            metadata={"source": "profile_completion"},
        ),
        db_session=db_session,
    )
    await record_suggested_action_event(
        user=public_user(user),
        org_id=org.id or 1,
        event=SuggestedActionEventCreate(
            action_key="profile:add_avatar",
            event_type=SuggestedActionEventType.CLICKED,
            surface="journey",
        ),
        db_session=db_session,
    )

    state = db_session.exec(select(SuggestedActionState)).one()
    assert state.view_count == 1
    assert state.click_count == 1
    assert state.last_seen_at
    assert state.last_clicked_at
    assert state.completed_at is None
    assert state.metadata_json["source"] == "profile_completion"


@pytest.mark.asyncio
async def test_onboarding_provider_owns_click_completion_policy(db_session: Session):
    org = create_org(db_session)
    user = create_user(db_session, avatar_image="avatar.png", bio="Learner", profile={"sections": [{"title": "Identity"}]})

    await record_suggested_action_event(
        user=public_user(user),
        org_id=org.id or 1,
        event=SuggestedActionEventCreate(
            action_key="onboarding:visit_courses",
            event_type=SuggestedActionEventType.CLICKED,
            surface="journey",
        ),
        db_session=db_session,
    )

    state = db_session.exec(
        select(SuggestedActionState).where(
            SuggestedActionState.action_key == "onboarding:visit_courses"
        )
    ).one()
    assert state.click_count == 1
    assert state.completed_at is not None

    actions = await get_suggested_actions(
        user=public_user(user),
        org_id=org.id or 1,
        surface="journey",
        slot="primary",
        limit=6,
        db_session=db_session,
    )
    assert "onboarding:visit_courses" not in [action.key for action in actions]
