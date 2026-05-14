from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.roadmap import (
    RoadmapDetailRead,
    RoadmapEndStateOptionCreate,
    RoadmapEndStateOptionRead,
    RoadmapEndStateOptionUpdate,
    RoadmapEventCreate,
    RoadmapEventRead,
    RoadmapEventUpdate,
    RoadmapOptionCreate,
    RoadmapOptionRead,
    RoadmapOptionUpdate,
    RoadmapRequirementCreate,
    RoadmapRequirementRead,
    RoadmapRequirementUpdate,
    RoadmapTemplateEventCreate,
    RoadmapTemplateEventRead,
    RoadmapTemplateEventUpdate,
    RoadmapSummaryRead,
    UserRoadmapEndStateOption,
    UserRoadmapEvent,
    UserRoadmapOption,
    UserRoadmapRequirement,
    UserRoadmapTemplateEvent,
)
from src.db.users import PublicUser
from src.security.org_auth import require_org_membership


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _month_index(value: str | None) -> int | None:
    if not value:
        return None
    try:
        year_text, month_text = value.split("-", 1)
        year = int(year_text)
        month = int(month_text)
    except ValueError:
        return None
    if month < 1 or month > 12:
        return None
    return year * 12 + (month - 1)


def _month_value(index: int | None) -> str | None:
    if index is None:
        return None
    year = index // 12
    month = (index % 12) + 1
    return f"{year:04d}-{month:02d}"


def _validate_score(value: int | None, field_name: str) -> None:
    if value is not None and (value < 1 or value > 10):
        raise HTTPException(status_code=400, detail=f"{field_name} must be between 1 and 10")


def _validate_option_payload(data: RoadmapOptionCreate | RoadmapOptionUpdate) -> None:
    for field_name in ["skill_fit_score", "lifestyle_fit_score", "confidence_score"]:
        _validate_score(getattr(data, field_name, None), field_name)


def _validate_end_state_payload(data: RoadmapEndStateOptionCreate | RoadmapEndStateOptionUpdate) -> None:
    for field_name in ["skill_fit_score", "lifestyle_fit_score", "confidence_score"]:
        _validate_score(getattr(data, field_name, None), field_name)


def _validate_event_dates(start_date: str | None, end_date: str | None, is_ongoing: bool | None) -> None:
    start = _month_index(start_date)
    if start is None:
        raise HTTPException(status_code=400, detail="Start date must use YYYY-MM format")
    if is_ongoing:
        return
    if end_date:
        end = _month_index(end_date)
        if end is None:
            raise HTTPException(status_code=400, detail="End date must use YYYY-MM format")
        if start > end:
            raise HTTPException(status_code=400, detail="Start date must be earlier than or equal to end date")


def _roadmap_or_404(user: PublicUser, org_id: int, roadmap_uuid: str, db_session: Session) -> UserRoadmapOption:
    require_org_membership(user.id, org_id, db_session)
    roadmap = db_session.exec(
        select(UserRoadmapOption).where(
            UserRoadmapOption.roadmap_uuid == roadmap_uuid,
            UserRoadmapOption.user_id == user.id,
            UserRoadmapOption.org_id == org_id,
        )
    ).first()
    if not roadmap:
        raise HTTPException(status_code=404, detail="Roadmap option not found")
    return roadmap


def _end_state_or_404(user: PublicUser, org_id: int, option_uuid: str, db_session: Session) -> UserRoadmapEndStateOption:
    require_org_membership(user.id, org_id, db_session)
    option = db_session.exec(
        select(UserRoadmapEndStateOption).where(
            UserRoadmapEndStateOption.option_uuid == option_uuid,
            UserRoadmapEndStateOption.user_id == user.id,
            UserRoadmapEndStateOption.org_id == org_id,
        )
    ).first()
    if not option:
        raise HTTPException(status_code=404, detail="End state option not found")
    return option


def _template_event_or_404(user: PublicUser, org_id: int, template_event_uuid: str, db_session: Session) -> tuple[UserRoadmapEndStateOption, UserRoadmapTemplateEvent]:
    require_org_membership(user.id, org_id, db_session)
    row = db_session.exec(
        select(UserRoadmapEndStateOption, UserRoadmapTemplateEvent)
        .join(UserRoadmapTemplateEvent, UserRoadmapTemplateEvent.end_state_option_id == UserRoadmapEndStateOption.id)
        .where(
            UserRoadmapTemplateEvent.template_event_uuid == template_event_uuid,
            UserRoadmapEndStateOption.user_id == user.id,
            UserRoadmapEndStateOption.org_id == org_id,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Template block not found")
    return row


def _requirement_or_404(user: PublicUser, org_id: int, requirement_uuid: str, db_session: Session) -> tuple[UserRoadmapOption, UserRoadmapRequirement]:
    require_org_membership(user.id, org_id, db_session)
    row = db_session.exec(
        select(UserRoadmapOption, UserRoadmapRequirement)
        .join(UserRoadmapRequirement, UserRoadmapRequirement.roadmap_option_id == UserRoadmapOption.id)
        .where(
            UserRoadmapRequirement.requirement_uuid == requirement_uuid,
            UserRoadmapOption.user_id == user.id,
            UserRoadmapOption.org_id == org_id,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Roadmap requirement not found")
    return row


def _event_or_404(user: PublicUser, org_id: int, event_uuid: str, db_session: Session) -> tuple[UserRoadmapOption, UserRoadmapEvent]:
    require_org_membership(user.id, org_id, db_session)
    row = db_session.exec(
        select(UserRoadmapOption, UserRoadmapEvent)
        .join(UserRoadmapEvent, UserRoadmapEvent.roadmap_option_id == UserRoadmapOption.id)
        .where(
            UserRoadmapEvent.event_uuid == event_uuid,
            UserRoadmapOption.user_id == user.id,
            UserRoadmapOption.org_id == org_id,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Roadmap event not found")
    return row


def _requirement_by_uuid(roadmap_id: int, requirement_uuid: str | None, db_session: Session) -> UserRoadmapRequirement | None:
    if not requirement_uuid:
        return None
    requirement = db_session.exec(
        select(UserRoadmapRequirement).where(
            UserRoadmapRequirement.roadmap_option_id == roadmap_id,
            UserRoadmapRequirement.requirement_uuid == requirement_uuid,
        )
    ).first()
    if not requirement:
        raise HTTPException(status_code=400, detail="Requirement does not belong to this roadmap")
    return requirement


def _option_read(option: UserRoadmapOption) -> RoadmapOptionRead:
    return RoadmapOptionRead(
        roadmap_uuid=option.roadmap_uuid,
        title=option.title,
        description=option.description,
        end_state_title=option.end_state_title,
        end_state_type=option.end_state_type,
        status=option.status,
        skill_fit_score=option.skill_fit_score,
        lifestyle_fit_score=option.lifestyle_fit_score,
        confidence_score=option.confidence_score,
        target_annual_income=option.target_annual_income,
        expected_annual_income_low=option.expected_annual_income_low,
        expected_annual_income_mid=option.expected_annual_income_mid,
        expected_annual_income_high=option.expected_annual_income_high,
        expected_monthly_living_expenses=option.expected_monthly_living_expenses,
        notes=option.notes,
        end_state_option_uuid=None,
        creation_date=option.creation_date,
        update_date=option.update_date,
    )


def _template_event_read(event: UserRoadmapTemplateEvent) -> RoadmapTemplateEventRead:
    return RoadmapTemplateEventRead(
        template_event_uuid=event.template_event_uuid,
        category=event.category,
        title=event.title,
        description=event.description,
        start_offset_months=event.start_offset_months,
        duration_months=event.duration_months,
        dependency_key=event.dependency_key,
        fork_group_key=event.fork_group_key,
        optional=event.optional,
        estimated_monthly_income=event.estimated_monthly_income,
        estimated_monthly_expense=event.estimated_monthly_expense,
        estimated_one_time_cost=event.estimated_one_time_cost,
        sort_order=event.sort_order,
        creation_date=event.creation_date,
        update_date=event.update_date,
    )


def _end_state_read(option: UserRoadmapEndStateOption, db_session: Session) -> RoadmapEndStateOptionRead:
    built = db_session.exec(
        select(UserRoadmapOption.roadmap_uuid).where(UserRoadmapOption.end_state_option_id == option.id)
    ).first()
    template_events = db_session.exec(
        select(UserRoadmapTemplateEvent)
        .where(UserRoadmapTemplateEvent.end_state_option_id == option.id)
        .order_by(UserRoadmapTemplateEvent.sort_order.asc(), UserRoadmapTemplateEvent.start_offset_months.asc())
    ).all()
    return RoadmapEndStateOptionRead(
        option_uuid=option.option_uuid,
        title=option.title,
        description=option.description,
        end_state_type=option.end_state_type,
        starred=option.starred,
        skill_fit_score=option.skill_fit_score,
        lifestyle_fit_score=option.lifestyle_fit_score,
        confidence_score=option.confidence_score,
        target_annual_income=option.target_annual_income,
        expected_annual_income_low=option.expected_annual_income_low,
        expected_annual_income_mid=option.expected_annual_income_mid,
        expected_annual_income_high=option.expected_annual_income_high,
        notes=option.notes,
        built_roadmap_uuid=built,
        template_events=[_template_event_read(event) for event in template_events],
        creation_date=option.creation_date,
        update_date=option.update_date,
    )


def _requirement_read(requirement: UserRoadmapRequirement, events: list[UserRoadmapEvent]) -> RoadmapRequirementRead:
    satisfied = next((event.event_uuid for event in events if event.requirement_id == requirement.id), None)
    return RoadmapRequirementRead(
        requirement_uuid=requirement.requirement_uuid,
        title=requirement.title,
        description=requirement.description,
        category=requirement.category,
        requirement_group_key=requirement.requirement_group_key,
        requirement_logic=requirement.requirement_logic,
        sort_order=requirement.sort_order,
        satisfied_by_event_uuid=satisfied,
        creation_date=requirement.creation_date,
        update_date=requirement.update_date,
    )


def _event_read(event: UserRoadmapEvent, requirement_uuid: str | None = None) -> RoadmapEventRead:
    return RoadmapEventRead(
        event_uuid=event.event_uuid,
        category=event.category,
        title=event.title,
        description=event.description,
        start_date=event.start_date,
        end_date=event.end_date,
        is_ongoing=event.is_ongoing,
        employer=event.employer,
        institution=event.institution,
        estimated_monthly_income=event.estimated_monthly_income,
        estimated_monthly_expense=event.estimated_monthly_expense,
        estimated_one_time_cost=event.estimated_one_time_cost,
        required_step=event.required_step,
        requirement_uuid=requirement_uuid,
        sort_order=event.sort_order,
        creation_date=event.creation_date,
        update_date=event.update_date,
    )


def _summary(option: UserRoadmapOption, requirements: list[UserRoadmapRequirement], events: list[UserRoadmapEvent]) -> RoadmapSummaryRead:
    dated_events = [(event, _month_index(event.start_date), _month_index(event.end_date) if event.end_date else None) for event in events]
    starts = [start for _, start, _ in dated_events if start is not None]
    ends = [
        end if end is not None else start
        for _, start, end in dated_events
        if start is not None
    ]
    start_index = min(starts) if starts else None
    end_index = max(ends) if ends else None
    living_expenses = float(option.expected_monthly_living_expenses or 0)
    total_income = 0.0
    total_cost = 0.0
    first_income_index: int | None = None
    sustaining_index: int | None = None
    cash = 0.0
    lowest_cash = 0.0

    if start_index is not None and end_index is not None:
        for month in range(start_index, end_index + 1):
            income = 0.0
            event_expenses = 0.0
            one_time_costs = 0.0
            for event, event_start, event_end in dated_events:
                if event_start is None:
                    continue
                effective_end = event_end if event_end is not None else event_start
                if event_start <= month <= effective_end:
                    income += float(event.estimated_monthly_income or 0)
                    event_expenses += float(event.estimated_monthly_expense or 0)
                if event_start == month:
                    one_time_costs += float(event.estimated_one_time_cost or 0)
            if income > 0 and first_income_index is None:
                first_income_index = month
            total_income += income
            total_cost += event_expenses + one_time_costs + living_expenses
            cash += income - event_expenses - one_time_costs - living_expenses
            lowest_cash = min(lowest_cash, cash)
            if income >= event_expenses + living_expenses and income > 0 and sustaining_index is None:
                sustaining_index = month

    requirement_ids = {requirement.id for requirement in requirements}
    satisfied_ids = {event.requirement_id for event in events if event.requirement_id in requirement_ids}

    return RoadmapSummaryRead(
        start_date=_month_value(start_index),
        end_date=_month_value(end_index),
        total_months=(end_index - start_index + 1) if start_index is not None and end_index is not None else 0,
        months_until_first_income=(first_income_index - start_index + 1) if start_index is not None and first_income_index is not None else None,
        months_until_sustaining_income=(sustaining_index - start_index + 1) if start_index is not None and sustaining_index is not None else None,
        total_estimated_cost=round(total_cost, 2),
        total_estimated_income=round(total_income, 2),
        lowest_projected_cash_position=round(lowest_cash, 2),
        support_needed=round(abs(lowest_cash), 2) if lowest_cash < 0 else 0,
        income_low=option.expected_annual_income_low,
        income_mid=option.expected_annual_income_mid,
        income_high=option.expected_annual_income_high,
        monthly_living_expenses=option.expected_monthly_living_expenses,
        skill_fit_score=option.skill_fit_score,
        lifestyle_fit_score=option.lifestyle_fit_score,
        confidence_score=option.confidence_score,
        requirement_count=len(requirements),
        satisfied_requirement_count=len(satisfied_ids),
    )


def _detail_read(option: UserRoadmapOption, db_session: Session) -> RoadmapDetailRead:
    requirements = db_session.exec(
        select(UserRoadmapRequirement)
        .where(UserRoadmapRequirement.roadmap_option_id == option.id)
        .order_by(UserRoadmapRequirement.sort_order.asc(), UserRoadmapRequirement.creation_date.asc())
    ).all()
    events = db_session.exec(
        select(UserRoadmapEvent)
        .where(UserRoadmapEvent.roadmap_option_id == option.id)
        .order_by(UserRoadmapEvent.start_date.asc(), UserRoadmapEvent.sort_order.asc(), UserRoadmapEvent.creation_date.asc())
    ).all()
    requirement_uuid_by_id = {requirement.id: requirement.requirement_uuid for requirement in requirements}
    option_read = _option_read(option)
    if option.end_state_option_id:
        end_state = db_session.get(UserRoadmapEndStateOption, option.end_state_option_id)
        if end_state:
            option_read.end_state_option_uuid = end_state.option_uuid
    return RoadmapDetailRead(
        option=option_read,
        requirements=[_requirement_read(requirement, events) for requirement in requirements],
        events=[_event_read(event, requirement_uuid_by_id.get(event.requirement_id)) for event in events],
        summary=_summary(option, requirements, events),
    )


def _copy_templates_to_pathway(option: UserRoadmapOption, end_state: UserRoadmapEndStateOption, db_session: Session) -> None:
    templates = db_session.exec(
        select(UserRoadmapTemplateEvent)
        .where(UserRoadmapTemplateEvent.end_state_option_id == end_state.id)
        .order_by(UserRoadmapTemplateEvent.sort_order.asc(), UserRoadmapTemplateEvent.start_offset_months.asc())
    ).all()
    now = _now()
    for template in templates:
        event = UserRoadmapEvent(
            event_uuid=f"roadmap_event_{uuid4()}",
            roadmap_option_id=option.id or 0,
            category=template.category,
            title=template.title,
            description=template.description,
            start_date="2026-01",
            end_date=None,
            is_ongoing=False,
            estimated_monthly_income=template.estimated_monthly_income,
            estimated_monthly_expense=template.estimated_monthly_expense,
            estimated_one_time_cost=template.estimated_one_time_cost,
            required_step=not template.optional,
            sort_order=template.sort_order,
            creation_date=now,
            update_date=now,
        )
        start_index = _month_index(event.start_date) or 2026 * 12
        event_start = start_index + max(template.start_offset_months, 0)
        duration = max(template.duration_months, 1)
        event.start_date = _month_value(event_start) or "2026-01"
        event.end_date = _month_value(event_start + duration - 1)
        db_session.add(event)


async def list_roadmap_options(user: PublicUser, org_id: int, db_session: Session) -> list[RoadmapDetailRead]:
    require_org_membership(user.id, org_id, db_session)
    options = db_session.exec(
        select(UserRoadmapOption)
        .where(UserRoadmapOption.user_id == user.id, UserRoadmapOption.org_id == org_id)
        .order_by(UserRoadmapOption.update_date.desc())
    ).all()
    return [_detail_read(option, db_session) for option in options]


async def list_end_state_options(user: PublicUser, org_id: int, db_session: Session) -> list[RoadmapEndStateOptionRead]:
    require_org_membership(user.id, org_id, db_session)
    options = db_session.exec(
        select(UserRoadmapEndStateOption)
        .where(UserRoadmapEndStateOption.user_id == user.id, UserRoadmapEndStateOption.org_id == org_id)
        .order_by(UserRoadmapEndStateOption.update_date.desc())
    ).all()
    return [_end_state_read(option, db_session) for option in options]


async def get_end_state_option(user: PublicUser, org_id: int, option_uuid: str, db_session: Session) -> RoadmapEndStateOptionRead:
    return _end_state_read(_end_state_or_404(user, org_id, option_uuid, db_session), db_session)


async def create_end_state_option(user: PublicUser, org_id: int, data: RoadmapEndStateOptionCreate, db_session: Session) -> RoadmapEndStateOptionRead:
    require_org_membership(user.id, org_id, db_session)
    _validate_end_state_payload(data)
    now = _now()
    option = UserRoadmapEndStateOption(
        option_uuid=f"roadmap_end_state_{uuid4()}",
        user_id=user.id,
        org_id=org_id,
        creation_date=now,
        update_date=now,
        **data.model_dump(),
    )
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _end_state_read(option, db_session)


async def update_end_state_option(user: PublicUser, org_id: int, option_uuid: str, data: RoadmapEndStateOptionUpdate, db_session: Session) -> RoadmapEndStateOptionRead:
    option = _end_state_or_404(user, org_id, option_uuid, db_session)
    _validate_end_state_payload(data)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(option, key, value)
    option.update_date = _now()
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _end_state_read(option, db_session)


async def create_template_event(user: PublicUser, org_id: int, option_uuid: str, data: RoadmapTemplateEventCreate, db_session: Session) -> RoadmapEndStateOptionRead:
    option = _end_state_or_404(user, org_id, option_uuid, db_session)
    now = _now()
    event = UserRoadmapTemplateEvent(
        template_event_uuid=f"roadmap_template_event_{uuid4()}",
        end_state_option_id=option.id or 0,
        creation_date=now,
        update_date=now,
        **data.model_dump(),
    )
    db_session.add(event)
    option.update_date = now
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _end_state_read(option, db_session)


async def update_template_event(user: PublicUser, org_id: int, template_event_uuid: str, data: RoadmapTemplateEventUpdate, db_session: Session) -> RoadmapEndStateOptionRead:
    option, event = _template_event_or_404(user, org_id, template_event_uuid, db_session)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    now = _now()
    event.update_date = now
    option.update_date = now
    db_session.add(event)
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _end_state_read(option, db_session)


async def delete_template_event(user: PublicUser, org_id: int, template_event_uuid: str, db_session: Session) -> RoadmapEndStateOptionRead:
    option, event = _template_event_or_404(user, org_id, template_event_uuid, db_session)
    db_session.delete(event)
    option.update_date = _now()
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _end_state_read(option, db_session)


async def create_pathway_from_end_state(user: PublicUser, org_id: int, option_uuid: str, db_session: Session) -> RoadmapDetailRead:
    end_state = _end_state_or_404(user, org_id, option_uuid, db_session)
    existing = db_session.exec(
        select(UserRoadmapOption).where(
            UserRoadmapOption.user_id == user.id,
            UserRoadmapOption.org_id == org_id,
            UserRoadmapOption.end_state_option_id == end_state.id,
        )
    ).first()
    if existing:
        return _detail_read(existing, db_session)
    now = _now()
    option = UserRoadmapOption(
        roadmap_uuid=f"roadmap_{uuid4()}",
        user_id=user.id,
        org_id=org_id,
        end_state_option_id=end_state.id,
        title=end_state.title,
        description=end_state.description,
        end_state_title=end_state.title,
        end_state_type=end_state.end_state_type,
        status="draft",
        skill_fit_score=end_state.skill_fit_score,
        lifestyle_fit_score=end_state.lifestyle_fit_score,
        confidence_score=end_state.confidence_score,
        target_annual_income=end_state.target_annual_income,
        expected_annual_income_low=end_state.expected_annual_income_low,
        expected_annual_income_mid=end_state.expected_annual_income_mid,
        expected_annual_income_high=end_state.expected_annual_income_high,
        notes=end_state.notes,
        creation_date=now,
        update_date=now,
    )
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    _copy_templates_to_pathway(option, end_state, db_session)
    db_session.commit()
    db_session.refresh(option)
    return _detail_read(option, db_session)


async def get_roadmap_option(user: PublicUser, org_id: int, roadmap_uuid: str, db_session: Session) -> RoadmapDetailRead:
    return _detail_read(_roadmap_or_404(user, org_id, roadmap_uuid, db_session), db_session)


async def create_roadmap_option(user: PublicUser, org_id: int, data: RoadmapOptionCreate, db_session: Session) -> RoadmapDetailRead:
    require_org_membership(user.id, org_id, db_session)
    _validate_option_payload(data)
    now = _now()
    payload = data.model_dump(exclude={"end_state_option_uuid"})
    end_state = _end_state_or_404(user, org_id, data.end_state_option_uuid, db_session) if data.end_state_option_uuid else None
    option = UserRoadmapOption(
        roadmap_uuid=f"roadmap_{uuid4()}",
        user_id=user.id,
        org_id=org_id,
        end_state_option_id=end_state.id if end_state else None,
        creation_date=now,
        update_date=now,
        **payload,
    )
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _detail_read(option, db_session)


async def update_roadmap_option(user: PublicUser, org_id: int, roadmap_uuid: str, data: RoadmapOptionUpdate, db_session: Session) -> RoadmapDetailRead:
    option = _roadmap_or_404(user, org_id, roadmap_uuid, db_session)
    _validate_option_payload(data)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(option, key, value)
    option.update_date = _now()
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _detail_read(option, db_session)


async def delete_roadmap_option(user: PublicUser, org_id: int, roadmap_uuid: str, db_session: Session) -> dict:
    option = _roadmap_or_404(user, org_id, roadmap_uuid, db_session)
    db_session.delete(option)
    db_session.commit()
    return {"success": True}


async def create_requirement(user: PublicUser, org_id: int, roadmap_uuid: str, data: RoadmapRequirementCreate, db_session: Session) -> RoadmapDetailRead:
    option = _roadmap_or_404(user, org_id, roadmap_uuid, db_session)
    now = _now()
    requirement = UserRoadmapRequirement(
        requirement_uuid=f"roadmap_requirement_{uuid4()}",
        roadmap_option_id=option.id or 0,
        creation_date=now,
        update_date=now,
        **data.model_dump(),
    )
    db_session.add(requirement)
    option.update_date = now
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _detail_read(option, db_session)


async def update_requirement(user: PublicUser, org_id: int, requirement_uuid: str, data: RoadmapRequirementUpdate, db_session: Session) -> RoadmapDetailRead:
    option, requirement = _requirement_or_404(user, org_id, requirement_uuid, db_session)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(requirement, key, value)
    now = _now()
    requirement.update_date = now
    option.update_date = now
    db_session.add(requirement)
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _detail_read(option, db_session)


async def delete_requirement(user: PublicUser, org_id: int, requirement_uuid: str, db_session: Session) -> RoadmapDetailRead:
    option, requirement = _requirement_or_404(user, org_id, requirement_uuid, db_session)
    db_session.delete(requirement)
    option.update_date = _now()
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _detail_read(option, db_session)


async def create_event(user: PublicUser, org_id: int, roadmap_uuid: str, data: RoadmapEventCreate, db_session: Session) -> RoadmapDetailRead:
    option = _roadmap_or_404(user, org_id, roadmap_uuid, db_session)
    _validate_event_dates(data.start_date, data.end_date, data.is_ongoing)
    requirement = _requirement_by_uuid(option.id or 0, data.requirement_uuid, db_session)
    payload = data.model_dump(exclude={"requirement_uuid"})
    now = _now()
    event = UserRoadmapEvent(
        event_uuid=f"roadmap_event_{uuid4()}",
        roadmap_option_id=option.id or 0,
        requirement_id=requirement.id if requirement else None,
        creation_date=now,
        update_date=now,
        **payload,
    )
    db_session.add(event)
    option.update_date = now
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _detail_read(option, db_session)


async def update_event(user: PublicUser, org_id: int, event_uuid: str, data: RoadmapEventUpdate, db_session: Session) -> RoadmapDetailRead:
    option, event = _event_or_404(user, org_id, event_uuid, db_session)
    payload = data.model_dump(exclude_unset=True)
    start_date = payload.get("start_date", event.start_date)
    end_date = payload.get("end_date", event.end_date)
    is_ongoing = payload.get("is_ongoing", event.is_ongoing)
    if "start_date" in payload or "end_date" in payload or "is_ongoing" in payload:
        _validate_event_dates(start_date, end_date, is_ongoing)
    if "requirement_uuid" in payload:
        requirement = _requirement_by_uuid(option.id or 0, payload.pop("requirement_uuid"), db_session)
        event.requirement_id = requirement.id if requirement else None
    for key, value in payload.items():
        setattr(event, key, value)
    now = _now()
    event.update_date = now
    option.update_date = now
    db_session.add(event)
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _detail_read(option, db_session)


async def delete_event(user: PublicUser, org_id: int, event_uuid: str, db_session: Session) -> RoadmapDetailRead:
    option, event = _event_or_404(user, org_id, event_uuid, db_session)
    db_session.delete(event)
    option.update_date = _now()
    db_session.add(option)
    db_session.commit()
    db_session.refresh(option)
    return _detail_read(option, db_session)
