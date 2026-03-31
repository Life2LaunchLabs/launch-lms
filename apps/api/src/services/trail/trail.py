from datetime import datetime
from typing import List
from uuid import uuid4

from fastapi import HTTPException, Request, status
from sqlmodel import Session, func, select

from src.db.courses.activities import Activity
from src.db.courses.chapter_activities import ChapterActivity
from src.db.courses.courses import Course
from src.db.trail_runs import TrailRun, TrailRunRead
from src.db.trail_steps import TrailStep
from src.db.trails import Trail, TrailCreate, TrailRead
from src.services.analytics import events as analytics_events
from src.services.analytics.analytics import track
from src.services.courses.certifications import check_course_completion_and_create_certificate
from src.services.guest_sessions import LearningActor


def _trail_owner_filters(actor: LearningActor):
    if actor.user_id is not None:
        return [Trail.user_id == actor.user_id]
    return [Trail.guest_session_id == actor.guest_session_id]


def _trailrun_owner_filters(actor: LearningActor):
    if actor.user_id is not None:
        return [TrailRun.user_id == actor.user_id]
    return [TrailRun.guest_session_id == actor.guest_session_id]


def _trailstep_owner_filters(actor: LearningActor):
    if actor.user_id is not None:
        return [TrailStep.user_id == actor.user_id]
    return [TrailStep.guest_session_id == actor.guest_session_id]


def _ensure_guest_course_access(course: Course, actor: LearningActor) -> None:
    if actor.is_guest and (not course.guest_access or not course.published):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Guest access is not enabled for this course",
        )


def _build_trail_read(
    trail: Trail,
    trail_runs_raw: List[TrailRun],
    db_session: Session,
    actor: LearningActor,
    with_course_info: bool = True,
) -> TrailRead:
    if not trail_runs_raw:
        return TrailRead(**trail.model_dump(), runs=[])

    trail_run_ids = [tr.id for tr in trail_runs_raw if tr.id is not None]
    course_ids = list({tr.course_id for tr in trail_runs_raw})

    course_map: dict[int, Course] = {}
    if course_ids:
        courses = db_session.exec(
            select(Course).where(Course.id.in_(course_ids))  # type: ignore
        ).all()
        course_map = {c.id: c for c in courses if c.id is not None}

    course_total_steps_map: dict[int, int] = {}
    if with_course_info and course_ids:
        step_counts = db_session.exec(
            select(ChapterActivity.course_id, func.count(ChapterActivity.id))  # type: ignore
            .where(ChapterActivity.course_id.in_(course_ids))  # type: ignore
            .group_by(ChapterActivity.course_id)
        ).all()
        course_total_steps_map = {row[0]: row[1] for row in step_counts}

    steps_statement = select(TrailStep).where(
        TrailStep.trailrun_id.in_(trail_run_ids)  # type: ignore
    )
    for owner_filter in _trailstep_owner_filters(actor):
        steps_statement = steps_statement.where(owner_filter)
    all_steps = db_session.exec(steps_statement).all()

    steps_by_run: dict[int, list[TrailStep]] = {}
    for step in all_steps:
        steps_by_run.setdefault(step.trailrun_id, []).append(step)

    step_course_ids = list({s.course_id for s in all_steps} - set(course_map.keys()))
    if step_course_ids:
        extra_courses = db_session.exec(
            select(Course).where(Course.id.in_(step_course_ids))  # type: ignore
        ).all()
        for course in extra_courses:
            if course.id is not None:
                course_map[course.id] = course

    trail_runs = []
    for trail_run in trail_runs_raw:
        course = course_map.get(trail_run.course_id)
        run = TrailRunRead(
            **trail_run.model_dump(),
            course=course.model_dump() if course else {},
            steps=[],
            course_total_steps=course_total_steps_map.get(trail_run.course_id, 0) if with_course_info else 0,
        )

        for step in steps_by_run.get(trail_run.id or 0, []):
            db_session.expunge(step)
            step_course = course_map.get(step.course_id)
            step.data = dict(course=step_course)
            run.steps.append(step)

        trail_runs.append(run)

    return TrailRead(**trail.model_dump(), runs=trail_runs)


async def create_user_trail(
    request: Request,
    actor: LearningActor,
    trail_object: TrailCreate,
    db_session: Session,
) -> Trail:
    statement = select(Trail).where(Trail.org_id == trail_object.org_id)
    for owner_filter in _trail_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail = db_session.exec(statement).first()

    if trail:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trail already exists",
        )

    now = datetime.now()
    trail = Trail.model_validate(trail_object)
    trail.creation_date = str(now)
    trail.update_date = str(now)
    trail.trail_uuid = f"trail_{uuid4()}"
    trail.user_id = actor.user_id
    trail.guest_session_id = actor.guest_session_id

    db_session.add(trail)
    db_session.commit()
    db_session.refresh(trail)
    return trail


async def check_trail_presence(
    org_id: int,
    request: Request,
    actor: LearningActor,
    db_session: Session,
) -> Trail:
    statement = select(Trail).where(Trail.org_id == org_id)
    for owner_filter in _trail_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail = db_session.exec(statement).first()

    if trail:
        return trail

    return await create_user_trail(
        request,
        actor,
        TrailCreate(
            org_id=org_id,
            user_id=actor.user_id,
            guest_session_id=actor.guest_session_id,
        ),
        db_session,
    )


async def get_user_trails(
    request: Request,
    actor: LearningActor,
    db_session: Session,
) -> TrailRead:
    statement = select(Trail)
    for owner_filter in _trail_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail = db_session.exec(statement).first()

    if not trail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trail not found"
        )

    statement = select(TrailRun).where(TrailRun.trail_id == trail.id)
    for owner_filter in _trailrun_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail_runs_raw = db_session.exec(statement).all()

    return _build_trail_read(trail, list(trail_runs_raw), db_session, actor)


async def get_user_trail_with_orgid(
    request: Request,
    actor: LearningActor,
    org_id: int,
    db_session: Session,
) -> TrailRead:
    trail = await check_trail_presence(
        org_id=org_id,
        request=request,
        actor=actor,
        db_session=db_session,
    )

    statement = select(TrailRun).where(TrailRun.trail_id == trail.id)
    for owner_filter in _trailrun_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail_runs_raw = db_session.exec(statement).all()

    return _build_trail_read(trail, list(trail_runs_raw), db_session, actor)


async def add_activity_to_trail(
    request: Request,
    actor: LearningActor,
    activity_uuid: str,
    db_session: Session,
) -> TrailRead:
    activity = db_session.exec(
        select(Activity).where(Activity.activity_uuid == activity_uuid)
    ).first()
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

    course = db_session.exec(select(Course).where(Course.id == activity.course_id)).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    _ensure_guest_course_access(course, actor)

    trail = await check_trail_presence(
        org_id=course.org_id,
        request=request,
        actor=actor,
        db_session=db_session,
    )

    statement = select(TrailRun).where(
        TrailRun.trail_id == trail.id,
        TrailRun.course_id == course.id,
    )
    for owner_filter in _trailrun_owner_filters(actor):
        statement = statement.where(owner_filter)
    trailrun = db_session.exec(statement).first()

    if not trailrun:
        trailrun = TrailRun(
            trail_id=trail.id or 0,
            course_id=course.id or 0,
            org_id=course.org_id,
            user_id=actor.user_id,
            guest_session_id=actor.guest_session_id,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
        db_session.add(trailrun)
        db_session.commit()
        db_session.refresh(trailrun)

    statement = select(TrailStep).where(
        TrailStep.trailrun_id == trailrun.id,
        TrailStep.activity_id == activity.id,
    )
    for owner_filter in _trailstep_owner_filters(actor):
        statement = statement.where(owner_filter)
    trailstep = db_session.exec(statement).first()

    is_new_completion = trailstep is None
    if is_new_completion:
        trailstep = TrailStep(
            trailrun_id=trailrun.id or 0,
            activity_id=activity.id or 0,
            course_id=course.id or 0,
            trail_id=trail.id or 0,
            org_id=course.org_id,
            complete=True,
            teacher_verified=False,
            grade="",
            data={},
            user_id=actor.user_id,
            guest_session_id=actor.guest_session_id,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
        db_session.add(trailstep)
        db_session.commit()
        db_session.refresh(trailstep)

    if is_new_completion and actor.user_id is not None:
        await track(
            event_name=analytics_events.ACTIVITY_COMPLETED,
            org_id=course.org_id,
            user_id=actor.user_id,
            properties={
                "activity_uuid": activity_uuid,
                "course_uuid": course.course_uuid,
                "activity_type": activity.activity_type if activity.activity_type else "",
            },
        )

    course_was_completed = False
    if actor.user_id is not None and course.id:
        course_was_completed = await check_course_completion_and_create_certificate(
            request, actor.user_id, course.id, db_session
        )

    if course_was_completed and actor.user_id is not None:
        await track(
            event_name=analytics_events.COURSE_COMPLETED,
            org_id=course.org_id,
            user_id=actor.user_id,
            properties={"course_uuid": course.course_uuid},
        )

    statement = select(TrailRun).where(TrailRun.trail_id == trail.id)
    for owner_filter in _trailrun_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail_runs_raw = db_session.exec(statement).all()

    return _build_trail_read(trail, list(trail_runs_raw), db_session, actor)


async def remove_activity_from_trail(
    request: Request,
    actor: LearningActor,
    activity_uuid: str,
    db_session: Session,
) -> TrailRead:
    activity = db_session.exec(
        select(Activity).where(Activity.activity_uuid == activity_uuid)
    ).first()
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

    course = db_session.exec(select(Course).where(Course.id == activity.course_id)).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    _ensure_guest_course_access(course, actor)

    statement = select(Trail).where(Trail.org_id == course.org_id)
    for owner_filter in _trail_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail = db_session.exec(statement).first()
    if not trail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trail not found")

    statement = select(TrailStep).where(
        TrailStep.activity_id == activity.id,
        TrailStep.trail_id == trail.id,
    )
    for owner_filter in _trailstep_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail_step = db_session.exec(statement).first()

    if trail_step:
        db_session.delete(trail_step)
        db_session.commit()

    statement = select(TrailRun).where(TrailRun.trail_id == trail.id)
    for owner_filter in _trailrun_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail_runs_raw = db_session.exec(statement).all()

    return _build_trail_read(trail, list(trail_runs_raw), db_session, actor)


async def add_course_to_trail(
    request: Request,
    actor: LearningActor,
    course_uuid: str,
    db_session: Session,
) -> TrailRead:
    course = db_session.exec(select(Course).where(Course.course_uuid == course_uuid)).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    _ensure_guest_course_access(course, actor)

    statement = select(TrailRun).where(TrailRun.course_id == course.id)
    for owner_filter in _trailrun_owner_filters(actor):
        statement = statement.where(owner_filter)
    trailrun = db_session.exec(statement).first()
    if trailrun:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="TrailRun already exists"
        )

    trail = await check_trail_presence(
        org_id=course.org_id,
        request=request,
        actor=actor,
        db_session=db_session,
    )

    trail_run = TrailRun(
        trail_id=trail.id or 0,
        course_id=course.id or 0,
        org_id=course.org_id,
        user_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )
    db_session.add(trail_run)
    db_session.commit()
    db_session.refresh(trail_run)

    if actor.user_id is not None:
        await track(
            event_name=analytics_events.COURSE_ENROLLED,
            org_id=course.org_id,
            user_id=actor.user_id,
            properties={"course_uuid": course.course_uuid},
        )

    statement = select(TrailRun).where(TrailRun.trail_id == trail.id)
    for owner_filter in _trailrun_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail_runs_raw = db_session.exec(statement).all()

    return _build_trail_read(trail, list(trail_runs_raw), db_session, actor)


async def remove_course_from_trail(
    request: Request,
    actor: LearningActor,
    course_uuid: str,
    db_session: Session,
) -> TrailRead:
    course = db_session.exec(select(Course).where(Course.course_uuid == course_uuid)).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    _ensure_guest_course_access(course, actor)

    statement = select(Trail).where(Trail.org_id == course.org_id)
    for owner_filter in _trail_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail = db_session.exec(statement).first()
    if not trail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trail not found")

    statement = select(TrailRun).where(
        TrailRun.trail_id == trail.id,
        TrailRun.course_id == course.id,
    )
    for owner_filter in _trailrun_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail_run = db_session.exec(statement).first()
    if trail_run:
        db_session.delete(trail_run)
        db_session.commit()

    statement = select(TrailStep).where(TrailStep.course_id == course.id)
    for owner_filter in _trailstep_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail_steps = db_session.exec(statement).all()
    for trail_step in trail_steps:
        db_session.delete(trail_step)
    db_session.commit()

    statement = select(TrailRun).where(TrailRun.trail_id == trail.id)
    for owner_filter in _trailrun_owner_filters(actor):
        statement = statement.where(owner_filter)
    trail_runs_raw = db_session.exec(statement).all()

    return _build_trail_read(trail, list(trail_runs_raw), db_session, actor)
