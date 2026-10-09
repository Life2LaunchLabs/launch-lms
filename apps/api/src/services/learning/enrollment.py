"""Issuer selection, enrollment, programs and plan context for badge runs."""

from fastapi import HTTPException, Request, status
from sqlalchemy import inspect
from sqlmodel import Session, select
from src.db.learning import (
    BadgeIssuerAuthorization,
    BadgeIssuerAuthorizationStatus,
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    LearningActivity,
    LearningAwardSource,
    LearningBadge,
    LearningBadgeAward,
    LearningBadgeVersion,
    LearningBadgeVersionState,
    LearningPage,
    LearningPathRead,
    LearningRun,
)
from src.db.organizations import Organization
from src.db.planning import Plan, PlanObjective, PlanStatus
from src.db.programs import ParticipantStatus, ProgramAssignment, ProgramParticipant
from src.db.users import AnonymousUser, PublicUser
from src.services.guest_sessions import LearningActor
from src.services.learning_issuers import issuer_options, validate_issuer_start
from src.services.learning import access_rules, constants, lookups, run_navigation


def _effective_issuing_org_id(run: LearningRun | None, fallback_org_id: int) -> int:
    """The org responsible for grading/issuing a run; a null issuing_org_id means the badge's creator org."""
    if run is not None and run.issuing_org_id is not None:
        return run.issuing_org_id
    return fallback_org_id


def _get_approved_issuer_authorization(
    db_session: Session, badge_id: int, issuer_org_id: int
) -> BadgeIssuerAuthorization | None:
    return db_session.exec(
        select(BadgeIssuerAuthorization).where(
            BadgeIssuerAuthorization.badge_id == badge_id,
            BadgeIssuerAuthorization.issuer_org_id == issuer_org_id,
            BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.APPROVED,
        )
    ).first()


def _validate_issuer_selection(
    db_session: Session,
    badge: LearningBadge,
    issuing_org_id: int,
    user_id: int | None,
) -> BadgeIssuerLearnerLink | None:
    """Ensure a learner may run this badge under the selected issuing org."""
    program_org_ids = {item["org_id"] for item in _program_cooperating_orgs(db_session, badge, user_id)}
    return validate_issuer_start(db_session, badge, issuing_org_id, user_id, program_org_ids)


def _badge_requires_manual_grading(
    db_session: Session,
    badge: LearningBadge,
    version: LearningBadgeVersion,
) -> bool:
    pages = db_session.exec(
        select(LearningPage).where(
            LearningPage.badge_id == badge.id,
            LearningPage.version_id == version.id,
        )
    ).all()
    return any(
        run_navigation._block_scoring(page, question).get("mode") == "manual"
        for page in pages
        for question in run_navigation._question_blocks(page)
    )


def _manual_enrollment_state(
    db_session: Session,
    badge: LearningBadge,
    version: LearningBadgeVersion,
    actor: LearningActor | None,
    assignment: ProgramAssignment | None,
) -> dict:
    user_id = actor.user_id if actor else None
    program_orgs = _program_cooperating_orgs(db_session, badge, user_id)
    options = issuer_options(db_session, badge, user_id, {item["org_id"] for item in program_orgs})
    accepted_links = db_session.exec(select(BadgeIssuerLearnerLink).where(
        BadgeIssuerLearnerLink.badge_id == badge.id,
        BadgeIssuerLearnerLink.user_id == user_id,
        BadgeIssuerLearnerLink.status == BadgeIssuerLearnerLinkStatus.ACCEPTED,
    )).all() if user_id else []
    accepted_org_ids = list(dict.fromkeys([
        *[link.issuer_org_id for link in accepted_links],
        *[item["org_id"] for item in program_orgs],
    ]))
    if assignment and assignment.org_id not in accepted_org_ids:
        accepted_org_ids.insert(0, assignment.org_id)
    collaborations_by_org: dict[int, dict] = {
        link.issuer_org_id: {
            "org": {
                "id": (link_org := access_rules._get_org(db_session, link.issuer_org_id)).id,
                "org_uuid": link_org.org_uuid,
                "slug": link_org.slug,
                "name": link_org.name,
                "logo_image": link_org.logo_image,
            },
            "link_uuid": link.link_uuid,
            "source": "direct",
        }
        for link in accepted_links
        if link.issuer_org_id != badge.org_id
    }
    for item in program_orgs:
        collaborations_by_org[item["org_id"]] = {
            "org": item["org"],
            "link_uuid": item.get("link_uuid"),
            "source": "program",
            "assignment_uuid": item["assignment_uuid"],
        }
    startable = assignment.org_id if assignment else options["startable_issuer_org_id"]
    return {
        "requires_cooperating_org": _badge_requires_manual_grading(db_session, badge, version),
        "satisfied": startable is not None,
        "accepted_issuer_org_id": startable,
        "default_issuer_org_id": options["default_issuer_org_id"],
        "active_cooperating_org_ids": accepted_org_ids,
        "collaborations": list(collaborations_by_org.values()),
        "program_collaborations": program_orgs,
        "issuers": options["issuers"],
    }


def _program_cooperating_orgs(
    db_session: Session,
    badge: LearningBadge,
    user_id: int | None,
) -> list[dict]:
    if user_id is None:
        return []
    # Some service-level tests intentionally build only the learning tables.
    if not inspect(db_session.get_bind()).has_table(ProgramParticipant.__tablename__):
        return []
    participants = db_session.exec(select(ProgramParticipant).where(
        ProgramParticipant.user_id == user_id,
        ProgramParticipant.status.in_([ParticipantStatus.ACTIVE, ParticipantStatus.COMPLETED]),
    )).all()
    results: list[dict] = []
    for participant in participants:
        assignment = db_session.get(ProgramAssignment, participant.assignment_id)
        if not assignment or not assignment.active or not any(
            int(item.get("badge_id") or 0) == int(badge.id or 0)
            for item in (assignment.objective_snapshot or [])
        ):
            continue
        if assignment.org_id != badge.org_id and not _get_approved_issuer_authorization(
            db_session, badge.id or 0, assignment.org_id
        ):
            continue
        collaboration = db_session.exec(select(BadgeIssuerLearnerLink).where(
            BadgeIssuerLearnerLink.badge_id == badge.id,
            BadgeIssuerLearnerLink.user_id == user_id,
            BadgeIssuerLearnerLink.issuer_org_id == assignment.org_id,
        )).first()
        if collaboration and collaboration.status != BadgeIssuerLearnerLinkStatus.ACCEPTED:
            continue
        org = db_session.get(Organization, assignment.org_id)
        if not org:
            continue
        results.append({
            "org_id": assignment.org_id,
            "org": {
                "id": org.id,
                "org_uuid": org.org_uuid,
                "slug": org.slug,
                "name": org.name,
                "logo_image": org.logo_image,
            },
            "assignment_uuid": assignment.assignment_uuid,
            "staff_user_ids": assignment.staff_user_ids or [],
            "link_uuid": collaboration.link_uuid if collaboration else None,
        })
    return results


def _program_assignment_context(
    db_session: Session,
    badge: LearningBadge,
    actor: LearningActor,
    assignment_uuid: str,
) -> tuple[ProgramAssignment, ProgramParticipant]:
    if actor.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to start an assigned badge",
        )
    assignment = db_session.exec(
        select(ProgramAssignment).where(
            ProgramAssignment.assignment_uuid == assignment_uuid,
            ProgramAssignment.active == True,  # noqa: E712
        )
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Program assignment not found")
    if not any(
        int(item.get("badge_id") or 0) == int(badge.id or 0)
        for item in (assignment.objective_snapshot or [])
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This badge is not part of the program assignment",
        )
    participant = db_session.exec(
        select(ProgramParticipant).where(
            ProgramParticipant.assignment_id == assignment.id,
            ProgramParticipant.user_id == actor.user_id,
            ProgramParticipant.status.in_([
                ParticipantStatus.ACTIVE,
                ParticipantStatus.COMPLETED,
            ]),
        )
    ).first()
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accept this program before starting its badge",
        )
    return assignment, participant


def _plan_objective_context(
    db_session: Session,
    badge: LearningBadge,
    actor: LearningActor,
    objective_uuid: str,
) -> tuple[Plan, PlanObjective]:
    if actor.user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to start a plan badge")
    row = db_session.exec(
        select(Plan, PlanObjective)
        .join(PlanObjective, PlanObjective.plan_id == Plan.id)
        .where(
            PlanObjective.objective_uuid == objective_uuid,
            PlanObjective.badge_id == badge.id,
            Plan.subject_user_id == actor.user_id,
            Plan.status == PlanStatus.ACTIVE,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This badge is not an active objective in one of your plans")
    return row


def _assignment_badge_major(
    assignment: ProgramAssignment, badge: LearningBadge
) -> int | None:
    return next(
        (
            int(item.get("badge_major_version") or 1)
            for item in (assignment.objective_snapshot or [])
            if int(item.get("badge_id") or 0) == int(badge.id or 0)
        ),
        None,
    )


def _published_badge_version_for_major(
    db_session: Session, badge: LearningBadge, major_version: int
) -> LearningBadgeVersion:
    versions = db_session.exec(select(LearningBadgeVersion).where(
        LearningBadgeVersion.badge_id == badge.id,
        LearningBadgeVersion.state == LearningBadgeVersionState.PUBLISHED,
    )).all()
    matching = [item for item in versions if _version_major(item) == major_version]
    if not matching:
        raise HTTPException(
            status_code=409,
            detail=f"Badge major version {major_version} is no longer available",
        )
    return max(matching, key=lambda item: item.semantic_version or "")


def _get_badge(db_session: Session, badge_uuid: str) -> LearningBadge:
    badge = db_session.exec(
        select(LearningBadge).where(
            LearningBadge.badge_uuid == access_rules._clean_uuid(badge_uuid, "badge_"),
            LearningBadge.deleted_at.is_(None),
        )
    ).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    return badge


def _version_major(version: LearningBadgeVersion | None) -> int:
    try:
        return int(str(version.semantic_version if version else "1.0.0").split(".")[0])
    except (TypeError, ValueError):
        return 1


def _actor_run_for_badge_major(
    db_session: Session,
    badge: LearningBadge,
    actor: LearningActor,
    major_version: int,
) -> LearningRun | None:
    statement = select(LearningRun).where(LearningRun.badge_id == badge.id)
    for owner_filter in access_rules._actor_filters(LearningRun, actor):
        statement = statement.where(owner_filter)
    candidates = db_session.exec(
        statement.order_by(LearningRun.started_at.desc())  # type: ignore
    ).all()
    version_ids = {item.badge_version_id for item in candidates if item.badge_version_id}
    versions = {
        item.id: item
        for item in db_session.exec(
            select(LearningBadgeVersion).where(LearningBadgeVersion.id.in_(version_ids))  # type: ignore
        ).all()
    } if version_ids else {}
    return next(
        (
            item for item in candidates
            if _version_major(versions.get(item.badge_version_id)) == major_version
        ),
        None,
    )


async def get_path(
    request: Request,
    badge_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    actor: LearningActor | None = None,
    version_uuid: str | None = None,
    program_assignment_uuid: str | None = None,
    plan_objective_uuid: str | None = None,
) -> LearningPathRead:
    badge = _get_badge(db_session, badge_uuid)
    lookups._ensure_read_badge(db_session, badge, current_user)
    path_assignment = None
    desired_version = lookups._get_badge_version(db_session, badge, version_uuid) if (version_uuid or badge.active_version_id) else lookups._get_badge_version(db_session, badge)
    if actor:
        if plan_objective_uuid:
            _, plan_objective = _plan_objective_context(db_session, badge, actor, plan_objective_uuid)
            if plan_objective.badge_major_version:
                desired_version = _published_badge_version_for_major(db_session, badge, plan_objective.badge_major_version)
        elif program_assignment_uuid:
            path_assignment, _ = _program_assignment_context(
                db_session, badge, actor, program_assignment_uuid
            )
            required_major = _assignment_badge_major(path_assignment, badge)
            if required_major is not None:
                desired_version = _published_badge_version_for_major(
                    db_session, badge, required_major
                )
        pinned_run = _actor_run_for_badge_major(
            db_session, badge, actor, _version_major(desired_version)
        )
        version = db_session.get(LearningBadgeVersion, pinned_run.badge_version_id) if pinned_run and pinned_run.badge_version_id else desired_version
    else:
        version = desired_version
    path = lookups._get_path_for_badge(
        db_session, badge, version, create=version.state == LearningBadgeVersionState.DRAFT
    )
    if not path:
        raise HTTPException(status_code=404, detail="This Achievement has no learning path")
    activities = db_session.exec(
        select(LearningActivity)
        .where(LearningActivity.path_id == path.id)
        .order_by(LearningActivity.order.asc())
    ).all()  # type: ignore
    if badge.system_type == constants.LEARNING_SYSTEM_TYPE_ONBOARDING:
        activities = [activity for activity in activities if activity.published]
    pages = db_session.exec(
        select(LearningPage)
        .where(
            LearningPage.badge_id == badge.id,
            LearningPage.version_id == version.id,
        )
        .order_by(LearningPage.order.asc())
    ).all()  # type: ignore
    pages_by_activity: dict[int, list[LearningPage]] = {}
    for page in pages:
        pages_by_activity.setdefault(page.activity_id, []).append(page)
    run = None
    non_path_award = None
    if actor:
        if program_assignment_uuid:
            path_assignment, _ = _program_assignment_context(
                db_session, badge, actor, program_assignment_uuid
            )
        run_obj = _actor_run_for_badge_major(
            db_session, badge, actor, _version_major(version)
        )
        if run_obj:
            run = run_navigation._serialize_run(db_session, run_obj)
        if actor.user_id is not None:
            major_version = int((version.semantic_version or "1.0.0").split(".")[0])
            candidate = db_session.exec(select(LearningBadgeAward).where(
                LearningBadgeAward.badge_id == badge.id,
                LearningBadgeAward.user_id == actor.user_id,
                LearningBadgeAward.major_version == major_version,
            )).first()
            if candidate and (candidate.source.value if hasattr(candidate.source, "value") else str(candidate.source)) != LearningAwardSource.PATH_COMPLETION.value:
                non_path_award = candidate
                if run:
                    run.award = candidate.model_dump()
    return LearningPathRead(
        path=path.model_dump(),
        badge=lookups._versioned_badge_read(db_session, badge, version),
        activities=[] if non_path_award else [
            lookups._serialize_activity(activity, pages_by_activity.get(activity.id or 0, []))
            for activity in activities
        ],
        run=run,
        enrollment=_manual_enrollment_state(
            db_session, badge, version, actor, path_assignment
        ),
    )
