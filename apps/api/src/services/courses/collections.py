from datetime import datetime
from typing import List
from uuid import uuid4
from sqlmodel import Session, select, or_
from src.db.users import AnonymousUser, PublicUser
from src.db.collections import (
    Collection,
    CollectionCreate,
    CollectionRead,
    CollectionUpdate,
    CourseCollectionRepairItem,
)
from src.db.collections_courses import CollectionCourse
from src.db.courses.courses import Course
from src.db.organizations import Organization
from fastapi import HTTPException, status, Request
from src.security.rbac import check_resource_access, AccessAction
from src.services.shared_content import owner_org_payload
from src.services.courses.courses import _serialize_course_read


def _replace_course_collection(
    course: Course,
    collection: Collection,
    db_session: Session,
) -> None:
    if course.org_id != collection.org_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Course and collection must belong to the same organization",
        )

    links = db_session.exec(
        select(CollectionCourse).where(CollectionCourse.course_id == course.id)
    ).all()
    for link in links:
        db_session.delete(link)

    course.collection_id = collection.id
    db_session.add(course)
    now = str(datetime.now())
    db_session.add(
        CollectionCourse(
            collection_id=int(collection.id),  # type: ignore
            course_id=int(course.id),  # type: ignore
            org_id=int(collection.org_id),
            creation_date=now,
            update_date=now,
        )
    )


async def assign_course_to_collection(
    request: Request,
    course_uuid: str,
    collection_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    course = db_session.exec(select(Course).where(Course.course_uuid == course_uuid)).first()
    collection = db_session.exec(
        select(Collection).where(Collection.collection_uuid == collection_uuid)
    ).first()
    if not course or not collection:
        raise HTTPException(status_code=404, detail="Course or collection not found")

    await check_resource_access(
        request, db_session, current_user, course.course_uuid, AccessAction.UPDATE
    )
    await check_resource_access(
        request, db_session, current_user, collection.collection_uuid, AccessAction.UPDATE
    )

    _replace_course_collection(course, collection, db_session)
    db_session.commit()
    return {"detail": "Course collection updated"}


async def get_course_collection_repairs(
    request: Request,
    org_id: int,
    current_user: PublicUser,
    db_session: Session,
) -> list[CourseCollectionRepairItem]:
    courses = db_session.exec(select(Course).where(Course.org_id == org_id)).all()
    collections = db_session.exec(select(Collection).where(Collection.org_id == org_id)).all()
    collections_by_id = {collection.id: collection for collection in collections}
    repairs: list[CourseCollectionRepairItem] = []

    for course in courses:
        links = db_session.exec(
            select(CollectionCourse).where(CollectionCourse.course_id == course.id)
        ).all()
        linked_collections = [
            collections_by_id[link.collection_id]
            for link in links
            if link.collection_id in collections_by_id
        ]
        if (
            len(linked_collections) == 1
            and len(links) == 1
            and course.collection_id == linked_collections[0].id
        ):
            continue

        decision = await check_resource_access(
            request,
            db_session,
            current_user,
            course.course_uuid,
            AccessAction.UPDATE,
            raise_on_deny=False,
        )
        if not decision.allowed:
            continue

        repairs.append(
            CourseCollectionRepairItem(
                course={
                    "id": course.id,
                    "course_uuid": course.course_uuid,
                    "name": course.name,
                    "description": course.description or "",
                },
                collections=[
                    {
                        "id": collection.id,
                        "collection_uuid": collection.collection_uuid,
                        "name": collection.name,
                    }
                    for collection in linked_collections
                ],
            )
        )

    return repairs


async def _filter_collection_courses(
    request: Request,
    courses: list[Course],
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[Course]:
    visible_courses: list[Course] = []
    for course in courses:
        if course.hidden:
            continue
        if current_user.user_uuid == "user_anonymous":
            if course.public and course.published:
                visible_courses.append(course)
            continue
        decision = await check_resource_access(
            request,
            db_session,
            current_user,
            course.course_uuid,
            AccessAction.READ,
            raise_on_deny=False,
        )
        if decision.allowed and course.published:
            visible_courses.append(course)
    return visible_courses


def _serialize_collection(
    collection: Collection,
    courses: list,
    owner_org: Organization | None = None,
    current_org_id: int | None = None,
) -> CollectionRead:
    payload = CollectionRead(**collection.model_dump(), courses=courses).model_dump()
    if owner_org:
        payload.update(owner_org_payload(owner_org, current_org_id))
    return CollectionRead.model_validate(payload)


def _serialize_collection_courses(
    courses: list[Course],
    owner_orgs: dict[int, Organization],
    current_org_id: int | None = None,
) -> list:
    return [
        _serialize_course_read(
            course,
            [],
            owner_orgs.get(course.org_id),
            current_org_id,
        )
        for course in courses
    ]


####################################################
# CRUD
####################################################


async def get_collection(
    request: Request,
    collection_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> CollectionRead:
    statement = select(Collection).where(Collection.collection_uuid == collection_uuid)
    collection = db_session.exec(statement).first()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Collection does not exist"
        )

    # RBAC check
    await check_resource_access(
        request, db_session, current_user, collection.collection_uuid, AccessAction.READ
    )

    # get courses in collection
    statement_all = (
        select(Course)
        .where(
            Course.collection_id == collection.id,
            Course.org_id == collection.org_id,
            Course.hidden == False,
        )
    )

    statement_public = (
        select(Course)
        .where(
            Course.collection_id == collection.id,
            Course.org_id == collection.org_id,
            Course.public == True,
            Course.hidden == False,
        )
    )

    statement = statement_public if current_user.user_uuid == "user_anonymous" else statement_all
    courses = list(db_session.exec(statement).all())
    courses = await _filter_collection_courses(request, courses, current_user, db_session)
    course_owner_orgs = {
        org.id: org
        for org in db_session.exec(
            select(Organization).where(Organization.id.in_([course.org_id for course in courses]))  # type: ignore
        ).all()
    } if courses else {}
    serialized_courses = _serialize_collection_courses(
        courses,
        course_owner_orgs,
        collection.org_id,
    )

    owner_org = db_session.exec(select(Organization).where(Organization.id == collection.org_id)).first()
    collection = _serialize_collection(collection, serialized_courses, owner_org)

    return collection


async def get_collection_courses_for_management(
    request: Request,
    collection_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list:
    collection = db_session.exec(
        select(Collection).where(Collection.collection_uuid == collection_uuid)
    ).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    await check_resource_access(
        request, db_session, current_user, collection.collection_uuid, AccessAction.UPDATE
    )
    courses = list(
        db_session.exec(
            select(Course)
            .where(Course.collection_id == collection.id)
        ).all()
    )
    owner_org = db_session.exec(
        select(Organization).where(Organization.id == collection.org_id)
    ).first()
    owner_orgs = {collection.org_id: owner_org} if owner_org else {}
    return _serialize_collection_courses(courses, owner_orgs, collection.org_id)


async def create_collection(
    request: Request,
    collection_object: CollectionCreate,
    current_user: PublicUser,
    db_session: Session,
) -> CollectionRead:
    collection = Collection.model_validate(collection_object)
    collection.hidden = False
    collection.protected = False
    collection.system_type = None

    # SECURITY: Check if user has permission to create collections in this organization
    await check_resource_access(request, db_session, current_user, "collection_x", AccessAction.CREATE)

    # Plan limit: check collection count against the org's plan
    from src.db.organization_config import OrganizationConfig
    from src.security.features_utils.plans import get_plan_limit

    org_config = db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == collection_object.org_id)
    ).first()
    if org_config:
        config = org_config.config or {}
        version = config.get("config_version", "1.0")
        plan = config.get("plan", "free") if version.startswith("2") else config.get("cloud", {}).get("plan", "free")
        collection_limit = get_plan_limit(plan, "collections")
        if collection_limit > 0:
            existing_count = db_session.exec(
                select(Collection).where(Collection.org_id == collection_object.org_id)
            ).all()
            if len(existing_count) >= collection_limit:
                raise HTTPException(
                    status_code=403,
                    detail=f"Your plan allows a maximum of {collection_limit} collection(s). "
                           "Upgrade your plan to create more collections.",
                )

    # Complete the collection object
    collection.collection_uuid = f"collection_{uuid4()}"
    collection.creation_date = str(datetime.now())
    collection.update_date = str(datetime.now())

    # Add collection to database
    db_session.add(collection)
    db_session.commit()
    db_session.refresh(collection)

    # SECURITY: Link courses to collection - ensure user has access to all courses being added
    if collection:
        for course_id in collection_object.courses:
            # Check if user has access to this course
            statement = select(Course).where(Course.id == course_id)
            course = db_session.exec(statement).first()
            
            if course:
                # Verify user has read access to the course before adding it to collection
                try:
                    await check_resource_access(request, db_session, current_user, course.course_uuid, AccessAction.READ)
                except HTTPException:
                    raise HTTPException(
                        status_code=403,
                        detail=f"You don't have permission to add course {course.name} to this collection"
                    )
                
                _replace_course_collection(course, collection, db_session)

    db_session.commit()
    db_session.refresh(collection)

    # Get courses once again
    statement = (
        select(Course)
        .where(Course.collection_id == collection.id)
    )
    courses = list(db_session.exec(statement).all())
    course_owner_orgs = {
        org.id: org
        for org in db_session.exec(
            select(Organization).where(Organization.id.in_([course.org_id for course in courses]))  # type: ignore
        ).all()
    } if courses else {}
    serialized_courses = _serialize_collection_courses(
        courses,
        course_owner_orgs,
        collection.org_id,
    )

    owner_org = db_session.exec(select(Organization).where(Organization.id == collection.org_id)).first()
    collection = _serialize_collection(collection, serialized_courses, owner_org)

    return CollectionRead.model_validate(collection)


async def update_collection(
    request: Request,
    collection_object: CollectionUpdate,
    collection_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> CollectionRead:
    statement = select(Collection).where(Collection.collection_uuid == collection_uuid)
    collection = db_session.exec(statement).first()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Collection does not exist"
        )

    # RBAC check
    await check_resource_access(
        request, db_session, current_user, collection.collection_uuid, AccessAction.UPDATE
    )

    courses = collection_object.courses

    # Update only the fields that were passed in
    for var, value in vars(collection_object).items():
        if var in {"hidden", "protected", "system_type"}:
            continue
        if var != "courses" and value is not None:
            setattr(collection, var, value)

    collection.update_date = str(datetime.now())

    # Legacy clients may still submit a courses list. Treat every listed course as
    # moving into this collection; omitted courses retain their current owner.
    for course in courses or []:
        course_record = db_session.exec(select(Course).where(Course.id == int(course))).first()
        if course_record:
            _replace_course_collection(course_record, collection, db_session)

    db_session.commit()
    db_session.refresh(collection)

    # Get courses once again
    statement = (
        select(Course)
        .where(Course.collection_id == collection.id)
    )
    courses = list(db_session.exec(statement).all())
    course_owner_orgs = {
        org.id: org
        for org in db_session.exec(
            select(Organization).where(Organization.id.in_([course.org_id for course in courses]))  # type: ignore
        ).all()
    } if courses else {}
    serialized_courses = _serialize_collection_courses(
        courses,
        course_owner_orgs,
        collection.org_id,
    )

    owner_org = db_session.exec(select(Organization).where(Organization.id == collection.org_id)).first()
    collection = _serialize_collection(collection, serialized_courses, owner_org)

    return collection


async def delete_collection(
    request: Request,
    collection_uuid: str,
    current_user: PublicUser,
    db_session: Session,
):
    statement = select(Collection).where(Collection.collection_uuid == collection_uuid)
    collection = db_session.exec(statement).first()

    if not collection:
        raise HTTPException(
            status_code=404,
            detail="Collection not found",
        )

    if collection.protected or collection.system_type:
        raise HTTPException(
            status_code=403,
            detail="System collections cannot be deleted",
        )

    # RBAC check
    await check_resource_access(
        request, db_session, current_user, collection.collection_uuid, AccessAction.DELETE
    )

    statement = select(CollectionCourse).where(CollectionCourse.collection_id == collection.id)
    collection_courses = db_session.exec(statement).all()
    owned_course = db_session.exec(
        select(Course).where(Course.collection_id == collection.id).limit(1)
    ).first()
    if collection_courses or owned_course:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Move or delete every course before deleting this collection",
        )

    db_session.delete(collection)
    db_session.commit()

    return {"detail": "Collection deleted"}


####################################################
# Misc
####################################################


async def get_collections(
    request: Request,
    org_id: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    page: int = 1,
    limit: int = 10,
    include_shared: bool = True,
) -> List[CollectionRead]:
    statement_public = (
        select(Collection)
        .where(
            or_(
                Collection.org_id == org_id,
                Collection.shared == True,
            ),
            Collection.public == True,
            Collection.hidden == False,
        )
        .distinct(Collection.id)  # type: ignore
        if include_shared
        else select(Collection).where(
            Collection.org_id == org_id,
            Collection.public == True,
            Collection.hidden == False,
        )
    )
    statement_all = (
        select(Collection)
        .where(
            or_(
                Collection.org_id == org_id,
                Collection.shared == True,
            ),
            Collection.hidden == False,
        )
        .distinct(Collection.id)  # type: ignore
        if include_shared
        else select(Collection).where(Collection.org_id == org_id, Collection.hidden == False)
    )

    statement = statement_public if current_user.id == 0 else statement_all

    collections = db_session.exec(statement).all()

    if not collections:
        return []

    collection_ids = [collection.id for collection in collections]

    # Batch fetch all courses for all collections in a single query.
    batch_statement = (
        select(Course)
        .where(Course.collection_id.in_(collection_ids))  # type: ignore
        .where(Course.hidden == False)
    )

    batch_results = db_session.exec(batch_statement).all()

    # Group courses by their owning collection.
    collection_courses_map: dict[int, list[Course]] = {}
    for course in batch_results:
        if course.collection_id is not None:
            collection_courses_map.setdefault(course.collection_id, []).append(course)

    owner_orgs = {
        org.id: org
        for org in db_session.exec(
            select(Organization).where(Organization.id.in_([collection.org_id for collection in collections]))  # type: ignore
        ).all()
    }

    collections_with_courses = []
    for collection in collections:
        courses = collection_courses_map.get(collection.id, [])
        courses = await _filter_collection_courses(request, courses, current_user, db_session)
        course_owner_orgs = {
            org.id: org
            for org in db_session.exec(
                select(Organization).where(Organization.id.in_([course.org_id for course in courses]))  # type: ignore
            ).all()
        } if courses else {}
        serialized_courses = _serialize_collection_courses(
            courses,
            course_owner_orgs,
            int(org_id),
        )
        collection_read = _serialize_collection(
            collection,
            serialized_courses,
            owner_orgs.get(collection.org_id),
            int(org_id),
        )
        collections_with_courses.append(collection_read)

    return collections_with_courses
