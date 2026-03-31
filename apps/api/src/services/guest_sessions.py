from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from fastapi import Request, Response
from sqlmodel import Session, select

from src.db.courses.quiz import QuizAttempt
from src.db.guest_sessions import GuestSession
from src.db.trail_runs import TrailRun
from src.db.trail_steps import TrailStep
from src.db.trails import Trail
from src.db.users import AnonymousUser, PublicUser
from src.security.cookies import get_cookie_domain_for_request, is_request_secure


GUEST_SESSION_COOKIE_NAME = "guest_session_cookie"


@dataclass
class LearningActor:
    user: PublicUser | None = None
    guest_session: GuestSession | None = None

    @property
    def is_guest(self) -> bool:
        return self.guest_session is not None and self.user is None

    @property
    def user_id(self) -> int | None:
        return self.user.id if self.user else None

    @property
    def guest_session_id(self) -> int | None:
        return self.guest_session.id if self.guest_session else None


def set_guest_session_cookie(response: Response, request: Request, guest_session_uuid: str) -> None:
    response.set_cookie(
        key=GUEST_SESSION_COOKIE_NAME,
        value=guest_session_uuid,
        httponly=True,
        secure=is_request_secure(request),
        samesite="lax",
        domain=get_cookie_domain_for_request(request),
        expires=int(60 * 60 * 24 * 30),
    )


def clear_guest_session_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(
        key=GUEST_SESSION_COOKIE_NAME,
        domain=get_cookie_domain_for_request(request),
    )


def get_guest_session_from_cookie(request: Request, db_session: Session) -> GuestSession | None:
    guest_session_uuid = request.cookies.get(GUEST_SESSION_COOKIE_NAME)
    if not guest_session_uuid:
        return None

    guest_session = db_session.exec(
        select(GuestSession).where(GuestSession.guest_session_uuid == guest_session_uuid)
    ).first()
    if not guest_session:
        return None

    now = datetime.utcnow()
    if guest_session.expires_at <= now:
        return None

    return guest_session


def get_or_create_guest_session(
    request: Request,
    response: Response,
    db_session: Session,
) -> GuestSession:
    guest_session = get_guest_session_from_cookie(request, db_session)
    now = datetime.utcnow()

    if guest_session:
        guest_session.update_date = str(now)
        db_session.add(guest_session)
        db_session.commit()
        db_session.refresh(guest_session)
        set_guest_session_cookie(response, request, guest_session.guest_session_uuid)
        return guest_session

    guest_session = GuestSession(
        guest_session_uuid=f"guest_{uuid4()}",
        creation_date=str(now),
        update_date=str(now),
    )
    db_session.add(guest_session)
    db_session.commit()
    db_session.refresh(guest_session)
    set_guest_session_cookie(response, request, guest_session.guest_session_uuid)
    return guest_session


def resolve_learning_actor(
    request: Request,
    response: Response,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningActor:
    if isinstance(current_user, PublicUser):
        return LearningActor(user=current_user)

    guest_session = get_or_create_guest_session(request, response, db_session)
    return LearningActor(guest_session=guest_session)


def transfer_guest_session_data_to_user(
    request: Request,
    response: Response | None,
    db_session: Session,
    user: PublicUser,
) -> None:
    guest_session = get_guest_session_from_cookie(request, db_session)
    if not guest_session or guest_session.id is None:
        return

    guest_trails = db_session.exec(
        select(Trail).where(Trail.guest_session_id == guest_session.id)
    ).all()

    for guest_trail in guest_trails:
        existing_user_trail = db_session.exec(
            select(Trail).where(
                Trail.org_id == guest_trail.org_id,
                Trail.user_id == user.id,
                Trail.guest_session_id.is_(None),  # type: ignore
            )
        ).first()

        if not existing_user_trail:
            guest_trail.user_id = user.id
            guest_trail.guest_session_id = None
            guest_trail.update_date = str(datetime.utcnow())
            db_session.add(guest_trail)

            guest_runs = db_session.exec(
                select(TrailRun).where(TrailRun.trail_id == guest_trail.id)
            ).all()
            for guest_run in guest_runs:
                guest_run.user_id = user.id
                guest_run.guest_session_id = None
                guest_run.update_date = str(datetime.utcnow())
                db_session.add(guest_run)

            guest_steps = db_session.exec(
                select(TrailStep).where(TrailStep.trail_id == guest_trail.id)
            ).all()
            for guest_step in guest_steps:
                guest_step.user_id = user.id
                guest_step.guest_session_id = None
                guest_step.update_date = str(datetime.utcnow())
                db_session.add(guest_step)
            continue

        guest_runs = db_session.exec(
            select(TrailRun).where(TrailRun.trail_id == guest_trail.id)
        ).all()
        for guest_run in guest_runs:
            existing_user_run = db_session.exec(
                select(TrailRun).where(
                    TrailRun.trail_id == existing_user_trail.id,
                    TrailRun.course_id == guest_run.course_id,
                    TrailRun.user_id == user.id,
                    TrailRun.guest_session_id.is_(None),  # type: ignore
                )
            ).first()

            if not existing_user_run:
                guest_run.trail_id = existing_user_trail.id or 0
                guest_run.user_id = user.id
                guest_run.guest_session_id = None
                guest_run.update_date = str(datetime.utcnow())
                db_session.add(guest_run)

                guest_steps = db_session.exec(
                    select(TrailStep).where(TrailStep.trailrun_id == guest_run.id)
                ).all()
                for guest_step in guest_steps:
                    guest_step.trail_id = existing_user_trail.id or 0
                    guest_step.user_id = user.id
                    guest_step.guest_session_id = None
                    guest_step.update_date = str(datetime.utcnow())
                    db_session.add(guest_step)
                continue

            guest_steps = db_session.exec(
                select(TrailStep).where(TrailStep.trailrun_id == guest_run.id)
            ).all()
            for guest_step in guest_steps:
                existing_step = db_session.exec(
                    select(TrailStep).where(
                        TrailStep.trailrun_id == existing_user_run.id,
                        TrailStep.activity_id == guest_step.activity_id,
                        TrailStep.user_id == user.id,
                        TrailStep.guest_session_id.is_(None),  # type: ignore
                    )
                ).first()
                if existing_step:
                    db_session.delete(guest_step)
                    continue

                guest_step.trailrun_id = existing_user_run.id or 0
                guest_step.trail_id = existing_user_trail.id or 0
                guest_step.user_id = user.id
                guest_step.guest_session_id = None
                guest_step.update_date = str(datetime.utcnow())
                db_session.add(guest_step)

            db_session.delete(guest_run)

        db_session.delete(guest_trail)

    guest_attempts = db_session.exec(
        select(QuizAttempt).where(QuizAttempt.guest_session_id == guest_session.id)
    ).all()
    for attempt in guest_attempts:
        attempt.user_id = user.id
        attempt.guest_session_id = None
        attempt.update_date = str(datetime.utcnow())
        db_session.add(attempt)

    guest_session.consumed_at = datetime.utcnow()
    guest_session.update_date = str(datetime.utcnow())
    db_session.add(guest_session)
    db_session.commit()

    if response is not None:
        clear_guest_session_cookie(response, request)
