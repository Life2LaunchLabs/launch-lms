"""Organization learning variable definitions."""

import re
from uuid import uuid4
from fastapi import HTTPException, Request
from sqlmodel import Session, select
from src.db.learning import (
    LearningVariable,
    LearningVariableCreate,
    LearningVariableRead,
    LearningVariableUpdate,
)
from src.db.users import AnonymousUser, PublicUser
from src.services.learning import access_rules, constants


_VARIABLE_SEGMENT_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")


def _validate_variable_key(key: str) -> str:
    normalized = str(key or "").strip().lower()
    segments = normalized.split(".")
    if not normalized or any(
        not _VARIABLE_SEGMENT_PATTERN.fullmatch(segment)
        or segment in constants._BLOCKED_VARIABLE_SEGMENTS
        for segment in segments
    ):
        raise HTTPException(
            status_code=422,
            detail="Variable keys must be dot-separated segments of lowercase letters, digits and underscores",
        )
    return normalized


def _get_variable(db_session: Session, variable_uuid: str) -> LearningVariable:
    variable = db_session.exec(
        select(LearningVariable).where(
            LearningVariable.variable_uuid
            == access_rules._clean_uuid(variable_uuid, "learning_variable_")
        )
    ).first()
    if not variable:
        raise HTTPException(status_code=404, detail="Learning variable not found")
    return variable


async def list_learning_variables(
    request: Request,
    org_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[LearningVariableRead]:
    access_rules._require_org_admin(db_session, current_user, org_id)
    variables = db_session.exec(
        select(LearningVariable)
        .where(LearningVariable.org_id == org_id)
        .order_by(LearningVariable.key.asc())  # type: ignore
    ).all()
    return [LearningVariableRead(**variable.model_dump()) for variable in variables]


async def create_learning_variable(
    request: Request,
    data: LearningVariableCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningVariableRead:
    access_rules._require_org_admin(db_session, current_user, data.org_id)
    key = _validate_variable_key(data.key)
    existing = db_session.exec(
        select(LearningVariable).where(
            LearningVariable.org_id == data.org_id, LearningVariable.key == key
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=409, detail="A variable with this key already exists"
        )
    now = access_rules._now()
    variable = LearningVariable(
        **{**data.model_dump(), "key": key},
        variable_uuid=f"learning_variable_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(variable)
    db_session.commit()
    db_session.refresh(variable)
    return LearningVariableRead(**variable.model_dump())


async def update_learning_variable(
    request: Request,
    variable_uuid: str,
    data: LearningVariableUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningVariableRead:
    variable = _get_variable(db_session, variable_uuid)
    access_rules._require_org_admin(db_session, current_user, variable.org_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(variable, key, value)
    variable.update_date = access_rules._now()
    db_session.add(variable)
    db_session.commit()
    db_session.refresh(variable)
    return LearningVariableRead(**variable.model_dump())


async def delete_learning_variable(
    request: Request,
    variable_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    variable = _get_variable(db_session, variable_uuid)
    access_rules._require_org_admin(db_session, current_user, variable.org_id)
    db_session.delete(variable)
    db_session.commit()
    return {"detail": "Learning variable deleted"}
