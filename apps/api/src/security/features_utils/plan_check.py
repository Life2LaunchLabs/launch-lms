"""
FastAPI dependencies for plan-based feature restrictions.

Provides dependency functions to enforce plan requirements at the router level.
"""

from fastapi import Depends, HTTPException, Request
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.organization_config import OrganizationConfig
from src.db.communities.communities import Community
from src.db.resources import Resource, ResourceChannel, ResourceComment
from src.security.features_utils.plans import PlanLevel, plan_meets_requirement

def get_org_plan(org_id: int, db_session: Session) -> PlanLevel:
    """
    Query the organization's current plan from OrganizationConfig.

    Args:
        org_id: The organization ID
        db_session: Database session

    Returns:
        The organization's plan level

    Raises:
        HTTPException: 404 if organization config not found
    """
    statement = select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)
    result = db_session.exec(statement)
    org_config = result.first()

    if org_config is None:
        raise HTTPException(
            status_code=404,
            detail="Organization configuration not found",
        )

    # Support both v1 (cloud.plan) and v2 (plan) config formats
    config = org_config.config or {}
    version = config.get("config_version", "1.0")
    if version.startswith("2"):
        return config.get("plan", "free")
    return config.get("cloud", {}).get("plan", "free")


def require_plan(required_plan: PlanLevel, feature_name: str):
    """
    Factory function that returns a FastAPI dependency to enforce plan requirements.

    Usage in router:
        dependencies=[Depends(require_plan("pro", "API Access"))]

    Args:
        required_plan: The minimum plan level required
        feature_name: Human-readable feature name for error messages

    Returns:
        A FastAPI dependency function
    """

    async def plan_dependency(
        request: Request,
        db_session: Session = Depends(get_db_session),
    ):
        org_id = None

        # Try to get org_id from path parameters first
        org_id_param = request.path_params.get("org_id")
        if org_id_param is not None:
            try:
                org_id = int(org_id_param)
            except (ValueError, TypeError):
                pass

        # Try to get org_id from query parameters as fallback
        if org_id is None:
            org_id_query = request.query_params.get("org_id")
            if org_id_query is not None:
                try:
                    org_id = int(org_id_query)
                except (ValueError, TypeError):
                    pass

        if org_id is None:
            raise HTTPException(
                status_code=400,
                detail="Organization ID is required",
            )

        current_plan = get_org_plan(org_id, db_session)

        if not plan_meets_requirement(current_plan, required_plan):
            raise HTTPException(
                status_code=403,
                detail=f"{feature_name} requires a {required_plan.capitalize()} plan or higher. "
                f"Your organization is currently on the {current_plan.capitalize()} plan.",
            )

        return True

    return plan_dependency


def require_plan_for_usergroups(required_plan: PlanLevel, feature_name: str):
    """
    Factory function that returns a FastAPI dependency to enforce plan requirements
    for usergroup routes. Resolves org_id from usergroup_id, path params, or query params.
    """

    async def plan_dependency(
        request: Request,
        db_session: Session = Depends(get_db_session),
    ):
        org_id = None

        # Try to get org_id from path parameters first
        org_id_param = request.path_params.get("org_id")
        if org_id_param is not None:
            try:
                org_id = int(org_id_param)
            except (ValueError, TypeError):
                pass

        # Try to get org_id from query parameters
        if org_id is None:
            org_id_query = request.query_params.get("org_id")
            if org_id_query is not None:
                try:
                    org_id = int(org_id_query)
                except (ValueError, TypeError):
                    pass

        # If no org_id, try to get it from usergroup_id in path
        if org_id is None:
            usergroup_id_param = request.path_params.get("usergroup_id")
            if usergroup_id_param:
                from src.db.usergroups import UserGroup
                try:
                    usergroup_id = int(usergroup_id_param)
                    statement = select(UserGroup).where(UserGroup.id == usergroup_id)
                    usergroup = db_session.exec(statement).first()
                    if usergroup:
                        org_id = usergroup.org_id
                except (ValueError, TypeError):
                    pass

        if org_id is None:
            # Can't determine org, allow the request (other checks will handle auth)
            return True

        current_plan = get_org_plan(org_id, db_session)

        if not plan_meets_requirement(current_plan, required_plan):
            raise HTTPException(
                status_code=403,
                detail=f"{feature_name} requires a {required_plan.capitalize()} plan or higher. "
                f"Your organization is currently on the {current_plan.capitalize()} plan.",
            )

        return True

    return plan_dependency


def require_plan_for_certifications(required_plan: PlanLevel, feature_name: str):
    """
    Factory function that returns a FastAPI dependency to enforce plan requirements
    for certification routes. Resolves org_id from certification_uuid, course_uuid,
    or user_certification_uuid via their related course's org_id.
    """

    async def plan_dependency(
        request: Request,
        db_session: Session = Depends(get_db_session),
    ):
        org_id = None
        path_params = request.path_params

        # Try to get org_id from path parameters first
        org_id_param = path_params.get("org_id")
        if org_id_param is not None:
            try:
                org_id = int(org_id_param)
            except (ValueError, TypeError):
                pass

        # Try to get org_id from query parameters
        if org_id is None:
            org_id_query = request.query_params.get("org_id")
            if org_id_query is not None:
                try:
                    org_id = int(org_id_query)
                except (ValueError, TypeError):
                    pass

        # Try certification_uuid -> course -> org_id
        if org_id is None and "certification_uuid" in path_params:
            from src.db.courses.certifications import Certifications
            from src.db.courses.courses import Course
            statement = select(Certifications).where(
                Certifications.certification_uuid == path_params["certification_uuid"]
            )
            cert = db_session.exec(statement).first()
            if cert:
                course = db_session.exec(
                    select(Course).where(Course.id == cert.course_id)
                ).first()
                if course:
                    org_id = course.org_id

        # Try course_uuid -> org_id
        if org_id is None and "course_uuid" in path_params:
            from src.db.courses.courses import Course
            statement = select(Course).where(
                Course.course_uuid == path_params["course_uuid"]
            )
            course = db_session.exec(statement).first()
            if course:
                org_id = course.org_id

        # Try user_certification_uuid -> certification -> course -> org_id
        if org_id is None and "user_certification_uuid" in path_params:
            from src.db.courses.certifications import Certifications, CertificateUser
            from src.db.courses.courses import Course
            statement = select(CertificateUser).where(
                CertificateUser.user_certification_uuid == path_params["user_certification_uuid"]
            )
            user_cert = db_session.exec(statement).first()
            if user_cert:
                cert = db_session.exec(
                    select(Certifications).where(Certifications.id == user_cert.certification_id)
                ).first()
                if cert:
                    course = db_session.exec(
                        select(Course).where(Course.id == cert.course_id)
                    ).first()
                    if course:
                        org_id = course.org_id

        if org_id is None:
            # Can't determine org, allow the request (other checks will handle auth)
            return True

        current_plan = get_org_plan(org_id, db_session)

        if not plan_meets_requirement(current_plan, required_plan):
            raise HTTPException(
                status_code=403,
                detail=f"{feature_name} requires a {required_plan.capitalize()} plan or higher. "
                f"Your organization is currently on the {current_plan.capitalize()} plan.",
            )

        return True

    return plan_dependency


def require_plan_for_boards(required_plan: PlanLevel, feature_name: str):
    """
    Factory function that returns a FastAPI dependency to enforce plan requirements
    for board routes. Resolves org_id from board_uuid, path params, or query params.

    Usage in router:
        dependencies=[Depends(require_plan_for_boards("pro", "Boards"))]
    """

    async def plan_dependency(
        request: Request,
        db_session: Session = Depends(get_db_session),
    ):

        org_id = None

        # Try to get org_id from path parameters first
        org_id_param = request.path_params.get("org_id")
        if org_id_param is not None:
            try:
                org_id = int(org_id_param)
            except (ValueError, TypeError):
                pass

        # Try to get org_id from query parameters
        if org_id is None:
            org_id_query = request.query_params.get("org_id")
            if org_id_query is not None:
                try:
                    org_id = int(org_id_query)
                except (ValueError, TypeError):
                    pass

        # If no org_id, try to get it from board_uuid in path
        if org_id is None:
            board_uuid = request.path_params.get("board_uuid")
            if board_uuid:
                from src.db.boards import Board
                statement = select(Board).where(Board.board_uuid == board_uuid)
                board = db_session.exec(statement).first()
                if board:
                    org_id = board.org_id

        if org_id is None:
            # Can't determine org, allow the request (other checks will handle auth)
            return True

        current_plan = get_org_plan(org_id, db_session)

        if not plan_meets_requirement(current_plan, required_plan):
            raise HTTPException(
                status_code=403,
                detail=f"{feature_name} requires a {required_plan.capitalize()} plan or higher. "
                f"Your organization is currently on the {current_plan.capitalize()} plan.",
            )

        return True

    return plan_dependency


def require_plan_for_playgrounds(required_plan: PlanLevel, feature_name: str):
    """
    Factory function that returns a FastAPI dependency to enforce plan requirements
    for playground routes. Resolves org_id from playground_uuid, path params, or query params.

    Usage in router:
        dependencies=[Depends(require_plan_for_playgrounds("pro", "Playgrounds"))]
    """

    async def plan_dependency(
        request: Request,
        db_session: Session = Depends(get_db_session),
    ):

        org_id = None

        # Try to get org_id from path parameters first
        org_id_param = request.path_params.get("org_id")
        if org_id_param is not None:
            try:
                org_id = int(org_id_param)
            except (ValueError, TypeError):
                pass

        # Try to get org_id from query parameters
        if org_id is None:
            org_id_query = request.query_params.get("org_id")
            if org_id_query is not None:
                try:
                    org_id = int(org_id_query)
                except (ValueError, TypeError):
                    pass

        # If no org_id, try to get it from playground_uuid in path
        if org_id is None:
            playground_uuid = request.path_params.get("playground_uuid")
            if playground_uuid:
                from src.dd.playgrounds import Playground
                statement = select(Playground).where(Playground.playground_uuid == playground_uuid)
                playground = db_session.exec(statement).first()
                if playground:
                    org_id = playground.org_id

        if org_id is None:
            # Can't determine org, allow the request (other checks will handle auth)
            return True

        current_plan = get_org_plan(org_id, db_session)

        if not plan_meets_requirement(current_plan, required_plan):
            raise HTTPException(
                status_code=403,
                detail=f"{feature_name} requires a {required_plan.capitalize()} plan or higher. "
                f"Your organization is currently on the {current_plan.capitalize()} plan.",
            )

        return True

    return plan_dependency


def require_plan_for_community(required_plan: PlanLevel, feature_name: str):
    """
    Factory function that returns a FastAPI dependency to enforce plan requirements
    for community routes. Can handle org_id from path params, query params, or look it up
    from community_uuid.

    Usage in router:
        dependencies=[Depends(require_plan_for_community("standard", "Communities"))]

    Args:
        required_plan: The minimum plan level required
        feature_name: Human-readable feature name for error messages

    Returns:
        A FastAPI dependency function
    """

    async def plan_dependency(
        request: Request,
        db_session: Session = Depends(get_db_session),
    ):

        org_id = None

        # Try to get org_id from path parameters first
        org_id_param = request.path_params.get("org_id")
        if org_id_param is not None:
            try:
                org_id = int(org_id_param)
            except (ValueError, TypeError):
                pass

        # Try to get org_id from query parameters
        if org_id is None:
            org_id_query = request.query_params.get("org_id")
            if org_id_query is not None:
                try:
                    org_id = int(org_id_query)
                except (ValueError, TypeError):
                    pass

        # If no org_id, try to get it from community_uuid in path
        if org_id is None:
            community_uuid = request.path_params.get("community_uuid")
            if community_uuid:
                # Look up the community to get its org_id
                statement = select(Community).where(Community.community_uuid == community_uuid)
                result = db_session.exec(statement)
                community = result.first()

                if community:
                    org_id = community.org_id

        if org_id is None:
            # Can't determine org, allow the request (other checks will handle auth)
            return True

        current_plan = get_org_plan(org_id, db_session)

        if not plan_meets_requirement(current_plan, required_plan):
            raise HTTPException(
                status_code=403,
                detail=f"{feature_name} requires a {required_plan.capitalize()} plan or higher. "
                f"Your organization is currently on the {current_plan.capitalize()} plan.",
            )

        return True

    return plan_dependency


def require_plan_for_resources(required_plan: PlanLevel, feature_name: str):
    """
    Factory function that returns a FastAPI dependency to enforce plan requirements
    for resource routes. Can resolve org_id from path params, query params,
    channel_uuid, resource_uuid, or comment_uuid.
    """

    async def plan_dependency(
        request: Request,
        db_session: Session = Depends(get_db_session),
    ):
        org_id = None

        org_id_param = request.path_params.get("org_id")
        if org_id_param is not None:
            try:
                org_id = int(org_id_param)
            except (ValueError, TypeError):
                pass

        if org_id is None:
            org_id_query = request.query_params.get("org_id")
            if org_id_query is not None:
                try:
                    org_id = int(org_id_query)
                except (ValueError, TypeError):
                    pass

        if org_id is None:
            channel_uuid = request.path_params.get("channel_uuid")
            if channel_uuid:
                statement = select(ResourceChannel).where(ResourceChannel.channel_uuid == channel_uuid)
                channel = db_session.exec(statement).first()
                if channel:
                    org_id = channel.org_id

        if org_id is None:
            resource_uuid = request.path_params.get("resource_uuid")
            if resource_uuid:
                statement = select(Resource).where(Resource.resource_uuid == resource_uuid)
                resource = db_session.exec(statement).first()
                if resource:
                    org_id = resource.org_id

        if org_id is None:
            comment_uuid = request.path_params.get("comment_uuid")
            if comment_uuid:
                statement = select(ResourceComment).where(ResourceComment.comment_uuid == comment_uuid)
                comment = db_session.exec(statement).first()
                if comment:
                    resource = db_session.exec(
                        select(Resource).where(Resource.id == comment.resource_id)
                    ).first()
                    if resource:
                        org_id = resource.org_id

        if org_id is None:
            return True

        current_plan = get_org_plan(org_id, db_session)

        if not plan_meets_requirement(current_plan, required_plan):
            raise HTTPException(
                status_code=403,
                detail=f"{feature_name} requires a {required_plan.capitalize()} plan or higher. "
                f"Your organization is currently on the {current_plan.capitalize()} plan.",
            )

        return True

    return plan_dependency
