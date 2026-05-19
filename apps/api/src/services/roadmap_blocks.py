from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.roadmap_blocks import (
    RoadmapBlockCreate,
    RoadmapBlockDefinition,
    RoadmapBlockRead,
    RoadmapBlockRequirement,
    RoadmapBlockRequirementCreate,
    RoadmapBlockRequirementRead,
    RoadmapBlockRequirementSummaryRead,
    RoadmapBlockUpdate,
    RoadmapBlockVisibility,
    RoadmapCashflowDirection,
    RoadmapCashflowPeriod,
    RoadmapPathway,
    RoadmapPathwayBlock,
    RoadmapPathwayBlockCreate,
    RoadmapPathwayBlockRead,
    RoadmapPathwayBlockUpdate,
    RoadmapPathwayCreate,
    RoadmapPathwayDetailRead,
    RoadmapPathwayRead,
    RoadmapPathwayUpdate,
    RoadmapRequirementStatusRead,
    RoadmapRequiredBlockSummary,
    RoadmapSummaryRead,
)
from src.db.users import PublicUser
from src.security.org_auth import require_org_membership


DEFAULT_PATHWAY_TITLE = "My Pathway"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _month_index(value: str | None) -> int | None:
    if not value:
        return None
    try:
        year, month = [int(part) for part in value.split("-", 1)]
    except ValueError:
        return None
    if month < 1 or month > 12:
        return None
    return year * 12 + month - 1


def _month_value(index: int | None) -> str | None:
    if index is None:
        return None
    return f"{index // 12:04d}-{(index % 12) + 1:02d}"


def _validate_dates(start_date: str | None, end_date: str | None, is_ongoing: bool | None) -> None:
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


def _validate_scores(data) -> None:
    for field in ("skill_fit_score", "lifestyle_fit_score", "confidence_score"):
        value = getattr(data, field, None)
        if value is not None and (value < 1 or value > 10):
            raise HTTPException(status_code=400, detail=f"{field} must be between 1 and 10")


def _cashflow_monthly(block: RoadmapBlockDefinition) -> tuple[float, float, float]:
    amount = block.cashflow_amount
    direction = block.cashflow_direction
    period = block.cashflow_period
    if amount is None or direction is None or period is None:
        return float(block.default_monthly_income or 0), float(block.default_monthly_expense or 0), float(block.default_one_time_cost or 0)

    if period == RoadmapCashflowPeriod.monthly:
        monthly_amount = float(amount)
    elif period == RoadmapCashflowPeriod.yearly:
        monthly_amount = float(amount) / 12
    else:
        return (0.0, 0.0, float(amount)) if direction == RoadmapCashflowDirection.expense else (float(amount), 0.0, 0.0)

    if direction == RoadmapCashflowDirection.income:
        return monthly_amount, 0.0, 0.0
    return 0.0, monthly_amount, 0.0


def _can_read_block(block: RoadmapBlockDefinition, user: PublicUser, org_id: int) -> bool:
    return block.org_id == org_id and (block.visibility == RoadmapBlockVisibility.org or block.owner_user_id == user.id)


def _can_edit_block(block: RoadmapBlockDefinition, user: PublicUser) -> bool:
    return block.visibility == RoadmapBlockVisibility.user and block.owner_user_id == user.id


def _block_or_404(user: PublicUser, org_id: int, block_uuid: str, db_session: Session) -> RoadmapBlockDefinition:
    require_org_membership(user.id, org_id, db_session)
    block = db_session.exec(select(RoadmapBlockDefinition).where(RoadmapBlockDefinition.block_uuid == block_uuid)).first()
    if not block or not _can_read_block(block, user, org_id):
        raise HTTPException(status_code=404, detail="Roadmap block not found")
    return block


def _pathway_or_404(user: PublicUser, org_id: int, pathway_uuid: str, db_session: Session) -> RoadmapPathway:
    require_org_membership(user.id, org_id, db_session)
    pathway = db_session.exec(
        select(RoadmapPathway).where(
            RoadmapPathway.pathway_uuid == pathway_uuid,
            RoadmapPathway.user_id == user.id,
            RoadmapPathway.org_id == org_id,
        )
    ).first()
    if not pathway:
        raise HTTPException(status_code=404, detail="Roadmap pathway not found")
    return pathway


def _pathway_block_or_404(user: PublicUser, org_id: int, pathway_block_uuid: str, db_session: Session) -> tuple[RoadmapPathway, RoadmapPathwayBlock]:
    require_org_membership(user.id, org_id, db_session)
    row = db_session.exec(
        select(RoadmapPathway, RoadmapPathwayBlock)
        .join(RoadmapPathwayBlock, RoadmapPathwayBlock.pathway_id == RoadmapPathway.id)
        .where(
            RoadmapPathwayBlock.pathway_block_uuid == pathway_block_uuid,
            RoadmapPathway.user_id == user.id,
            RoadmapPathway.org_id == org_id,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Roadmap pathway block not found")
    return row


def _requirement_summary(requirement: RoadmapBlockRequirement, required_block: RoadmapBlockDefinition) -> RoadmapBlockRequirementSummaryRead:
    return RoadmapBlockRequirementSummaryRead(
        requirement_uuid=requirement.requirement_uuid,
        block_uuid=required_block.block_uuid,
        required_block=RoadmapRequiredBlockSummary(
            block_uuid=required_block.block_uuid,
            title=required_block.title,
            block_type=required_block.block_type,
        ),
        group_key=requirement.group_key,
        logic=requirement.logic,
        sort_order=requirement.sort_order,
        creation_date=requirement.creation_date,
        update_date=requirement.update_date,
    )


def _requirement_summaries_for_block(block_id: int, db_session: Session) -> list[RoadmapBlockRequirementSummaryRead]:
    rows = db_session.exec(
        select(RoadmapBlockRequirement, RoadmapBlockDefinition)
        .join(RoadmapBlockDefinition, RoadmapBlockDefinition.id == RoadmapBlockRequirement.required_block_id)
        .where(RoadmapBlockRequirement.block_id == block_id)
        .order_by(RoadmapBlockRequirement.sort_order.asc(), RoadmapBlockRequirement.creation_date.asc())
    ).all()
    return [_requirement_summary(requirement, required_block) for requirement, required_block in rows]


def _block_read(block: RoadmapBlockDefinition, user: PublicUser, db_session: Session | None = None) -> RoadmapBlockRead:
    return RoadmapBlockRead(
        block_uuid=block.block_uuid,
        visibility=block.visibility,
        owner_user_id=block.owner_user_id,
        editable=_can_edit_block(block, user),
        requirements=_requirement_summaries_for_block(block.id or 0, db_session) if db_session and block.id else [],
        lane_category=block.lane_category,
        block_type=block.block_type,
        title=block.title,
        description=block.description,
        starred=block.starred,
        is_draft=block.is_draft,
        skill_fit_score=block.skill_fit_score,
        lifestyle_fit_score=block.lifestyle_fit_score,
        confidence_score=block.confidence_score,
        target_annual_income=block.target_annual_income,
        expected_annual_income_low=block.expected_annual_income_low,
        expected_annual_income_mid=block.expected_annual_income_mid,
        expected_annual_income_high=block.expected_annual_income_high,
        default_monthly_income=block.default_monthly_income,
        default_monthly_expense=block.default_monthly_expense,
        default_one_time_cost=block.default_one_time_cost,
        cashflow_amount=block.cashflow_amount,
        cashflow_direction=block.cashflow_direction,
        cashflow_period=block.cashflow_period,
        cashflow_stddev=block.cashflow_stddev,
        notes=block.notes,
        creation_date=block.creation_date,
        update_date=block.update_date,
    )


def _pathway_read(pathway: RoadmapPathway) -> RoadmapPathwayRead:
    return RoadmapPathwayRead(
        pathway_uuid=pathway.pathway_uuid,
        title=pathway.title,
        description=pathway.description,
        status=pathway.status,
        creation_date=pathway.creation_date,
        update_date=pathway.update_date,
    )


def _requirements_for_block(block_id: int, db_session: Session) -> list[RoadmapBlockRequirement]:
    return db_session.exec(
        select(RoadmapBlockRequirement)
        .where(RoadmapBlockRequirement.block_id == block_id)
        .order_by(RoadmapBlockRequirement.sort_order.asc(), RoadmapBlockRequirement.creation_date.asc())
    ).all()


def _requirement_statuses(
    pathway_block: RoadmapPathwayBlock,
    pathway_blocks: list[RoadmapPathwayBlock],
    blocks_by_id: dict[int, RoadmapBlockDefinition],
    user: PublicUser,
    db_session: Session,
) -> list[RoadmapRequirementStatusRead]:
    start = _month_index(pathway_block.start_date)
    statuses: list[RoadmapRequirementStatusRead] = []
    for requirement in _requirements_for_block(pathway_block.block_id, db_session):
        required_block = blocks_by_id.get(requirement.required_block_id) or db_session.get(RoadmapBlockDefinition, requirement.required_block_id)
        if not required_block:
            continue
        matching = [
            item
            for item in pathway_blocks
            if item.block_id == requirement.required_block_id
            and _month_index(item.end_date if not item.is_ongoing else item.start_date) is not None
            and start is not None
            and (_month_index(item.end_date if not item.is_ongoing else item.start_date) or 0) < start
        ]
        statuses.append(
            RoadmapRequirementStatusRead(
                requirement_uuid=requirement.requirement_uuid,
                required_block=_block_read(required_block, user),
                met=bool(matching),
                met_by_pathway_block_uuid=matching[0].pathway_block_uuid if matching else None,
                group_key=requirement.group_key,
                logic=requirement.logic,
            )
        )
    return statuses


def _summary(pathway_blocks: list[RoadmapPathwayBlock], blocks_by_id: dict[int, RoadmapBlockDefinition], unmet_count: int) -> RoadmapSummaryRead:
    starts = [_month_index(item.start_date) for item in pathway_blocks]
    ends = [_month_index(item.end_date if not item.is_ongoing else item.start_date) for item in pathway_blocks]
    starts = [item for item in starts if item is not None]
    ends = [item for item in ends if item is not None]
    start_index = min(starts) if starts else None
    end_index = max(ends) if ends else None
    total_income = 0.0
    total_cost = 0.0
    cash = 0.0
    lowest_cash = 0.0
    first_income: int | None = None
    sustaining: int | None = None
    if start_index is not None and end_index is not None:
        for month in range(start_index, end_index + 1):
            income = 0.0
            expense = 0.0
            one_time = 0.0
            for item in pathway_blocks:
                block = blocks_by_id.get(item.block_id)
                item_start = _month_index(item.start_date)
                item_end = _month_index(item.end_date if not item.is_ongoing else item.start_date)
                if item_start is None or item_end is None or not block:
                    continue
                if item_start <= month <= item_end:
                    block_income, block_expense, _ = _cashflow_monthly(block)
                    income += block_income
                    expense += block_expense
                if item_start == month:
                    _, _, block_one_time = _cashflow_monthly(block)
                    one_time += block_one_time
            if income > 0 and first_income is None:
                first_income = month
            if income >= expense and income > 0 and sustaining is None:
                sustaining = month
            total_income += income
            total_cost += expense + one_time
            cash += income - expense - one_time
            lowest_cash = min(lowest_cash, cash)
    return RoadmapSummaryRead(
        start_date=_month_value(start_index),
        end_date=_month_value(end_index),
        total_months=(end_index - start_index + 1) if start_index is not None and end_index is not None else 0,
        months_until_first_income=(first_income - start_index + 1) if first_income is not None and start_index is not None else None,
        months_until_sustaining_income=(sustaining - start_index + 1) if sustaining is not None and start_index is not None else None,
        total_estimated_cost=round(total_cost, 2),
        total_estimated_income=round(total_income, 2),
        lowest_projected_cash_position=round(lowest_cash, 2),
        support_needed=round(abs(lowest_cash), 2) if lowest_cash < 0 else 0,
        unmet_requirement_count=unmet_count,
    )


def _detail_read(pathway: RoadmapPathway, user: PublicUser, db_session: Session) -> RoadmapPathwayDetailRead:
    pathway_blocks = db_session.exec(
        select(RoadmapPathwayBlock)
        .where(RoadmapPathwayBlock.pathway_id == pathway.id)
        .order_by(RoadmapPathwayBlock.start_date.asc(), RoadmapPathwayBlock.sort_order.asc())
    ).all()
    block_ids = list({item.block_id for item in pathway_blocks})
    blocks = db_session.exec(select(RoadmapBlockDefinition).where(RoadmapBlockDefinition.id.in_(block_ids))).all() if block_ids else []
    blocks_by_id = {block.id: block for block in blocks if block.id is not None}
    reads: list[RoadmapPathwayBlockRead] = []
    unmet_count = 0
    for item in pathway_blocks:
        block = blocks_by_id[item.block_id]
        requirements = _requirement_statuses(item, pathway_blocks, blocks_by_id, user, db_session)
        unmet_count += len([requirement for requirement in requirements if not requirement.met])
        reads.append(
            RoadmapPathwayBlockRead(
                pathway_block_uuid=item.pathway_block_uuid,
                block=_block_read(block, user, db_session),
                start_date=item.start_date,
                end_date=item.end_date,
                is_ongoing=item.is_ongoing,
                title_override=item.title_override,
                description_override=item.description_override,
                monthly_income_override=item.monthly_income_override,
                monthly_expense_override=item.monthly_expense_override,
                one_time_cost_override=item.one_time_cost_override,
                notes=item.notes,
                sort_order=item.sort_order,
                requirements=requirements,
                unmet_requirements=[requirement for requirement in requirements if not requirement.met],
                creation_date=item.creation_date,
                update_date=item.update_date,
            )
        )
    return RoadmapPathwayDetailRead(pathway=_pathway_read(pathway), blocks=reads, summary=_summary(pathway_blocks, blocks_by_id, unmet_count))


async def list_blocks(user: PublicUser, org_id: int, db_session: Session) -> list[RoadmapBlockRead]:
    require_org_membership(user.id, org_id, db_session)
    blocks = db_session.exec(
        select(RoadmapBlockDefinition)
        .where(RoadmapBlockDefinition.org_id == org_id)
        .where((RoadmapBlockDefinition.visibility == RoadmapBlockVisibility.org) | (RoadmapBlockDefinition.owner_user_id == user.id))
        .order_by(RoadmapBlockDefinition.update_date.desc())
    ).all()
    return [_block_read(block, user, db_session) for block in blocks]


async def create_block(user: PublicUser, org_id: int, data: RoadmapBlockCreate, db_session: Session) -> RoadmapBlockRead:
    require_org_membership(user.id, org_id, db_session)
    _validate_scores(data)
    visibility = data.visibility
    owner_user_id = user.id if visibility == RoadmapBlockVisibility.user else None
    now = _now()
    block = RoadmapBlockDefinition(block_uuid=f"roadmap_block_{uuid4()}", org_id=org_id, owner_user_id=owner_user_id, creation_date=now, update_date=now, **data.model_dump(exclude={"visibility"}), visibility=visibility)
    db_session.add(block)
    db_session.commit()
    db_session.refresh(block)
    return _block_read(block, user, db_session)


async def update_block(user: PublicUser, org_id: int, block_uuid: str, data: RoadmapBlockUpdate, db_session: Session) -> RoadmapBlockRead:
    block = _block_or_404(user, org_id, block_uuid, db_session)
    if not _can_edit_block(block, user):
        raise HTTPException(status_code=403, detail="Only the owner can edit this block")
    _validate_scores(data)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(block, key, value)
    block.update_date = _now()
    db_session.add(block)
    db_session.commit()
    db_session.refresh(block)
    return _block_read(block, user, db_session)


async def delete_block(user: PublicUser, org_id: int, block_uuid: str, db_session: Session) -> dict:
    block = _block_or_404(user, org_id, block_uuid, db_session)
    if not _can_edit_block(block, user):
        raise HTTPException(status_code=403, detail="Only the owner can delete this block")
    pathway_blocks = db_session.exec(select(RoadmapPathwayBlock).where(RoadmapPathwayBlock.block_id == block.id)).all()
    pathway_ids = {item.pathway_id for item in pathway_blocks}
    requirements = db_session.exec(
        select(RoadmapBlockRequirement).where(
            (RoadmapBlockRequirement.block_id == block.id) | (RoadmapBlockRequirement.required_block_id == block.id)
        )
    ).all()
    now = _now()
    for requirement in requirements:
        db_session.delete(requirement)
    for pathway_block in pathway_blocks:
        db_session.delete(pathway_block)
    if pathway_ids:
        pathways = db_session.exec(select(RoadmapPathway).where(RoadmapPathway.id.in_(pathway_ids))).all()
        for pathway in pathways:
            pathway.update_date = now
            db_session.add(pathway)
    db_session.delete(block)
    db_session.commit()
    return {"success": True}


async def create_block_requirement(user: PublicUser, org_id: int, block_uuid: str, data: RoadmapBlockRequirementCreate, db_session: Session) -> RoadmapBlockRequirementRead:
    block = _block_or_404(user, org_id, block_uuid, db_session)
    if not _can_edit_block(block, user):
        raise HTTPException(status_code=403, detail="Only the owner can edit this block")
    required = _block_or_404(user, org_id, data.required_block_uuid, db_session)
    now = _now()
    requirement = RoadmapBlockRequirement(
        requirement_uuid=f"roadmap_requirement_{uuid4()}",
        block_id=block.id or 0,
        required_block_id=required.id or 0,
        group_key=data.group_key,
        logic=data.logic,
        sort_order=data.sort_order,
        creation_date=now,
        update_date=now,
    )
    db_session.add(requirement)
    db_session.commit()
    db_session.refresh(requirement)
    return RoadmapBlockRequirementRead(
        requirement_uuid=requirement.requirement_uuid,
        block_uuid=block.block_uuid,
        required_block=_block_read(required, user, db_session),
        group_key=requirement.group_key,
        logic=requirement.logic,
        sort_order=requirement.sort_order,
        creation_date=requirement.creation_date,
        update_date=requirement.update_date,
    )


async def delete_block_requirement(user: PublicUser, org_id: int, requirement_uuid: str, db_session: Session) -> dict:
    require_org_membership(user.id, org_id, db_session)
    row = db_session.exec(
        select(RoadmapBlockRequirement, RoadmapBlockDefinition)
        .join(RoadmapBlockDefinition, RoadmapBlockDefinition.id == RoadmapBlockRequirement.block_id)
        .where(RoadmapBlockRequirement.requirement_uuid == requirement_uuid)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Requirement not found")
    requirement, block = row
    if not _can_edit_block(block, user):
        raise HTTPException(status_code=403, detail="Only the owner can edit this block")
    db_session.delete(requirement)
    db_session.commit()
    return {"success": True}


async def list_pathways(user: PublicUser, org_id: int, db_session: Session) -> list[RoadmapPathwayDetailRead]:
    require_org_membership(user.id, org_id, db_session)
    pathways = db_session.exec(select(RoadmapPathway).where(RoadmapPathway.user_id == user.id, RoadmapPathway.org_id == org_id).order_by(RoadmapPathway.update_date.desc())).all()
    return [_detail_read(pathway, user, db_session) for pathway in pathways]


async def create_pathway(user: PublicUser, org_id: int, data: RoadmapPathwayCreate, db_session: Session) -> RoadmapPathwayDetailRead:
    require_org_membership(user.id, org_id, db_session)
    now = _now()
    pathway = RoadmapPathway(pathway_uuid=f"roadmap_pathway_{uuid4()}", user_id=user.id, org_id=org_id, creation_date=now, update_date=now, **data.model_dump())
    db_session.add(pathway)
    db_session.commit()
    db_session.refresh(pathway)
    return _detail_read(pathway, user, db_session)


def _create_draft_block_and_instance(user: PublicUser, org_id: int, pathway: RoadmapPathway, db_session: Session) -> RoadmapPathwayBlock:
    now = _now()
    block = RoadmapBlockDefinition(
        block_uuid=f"roadmap_block_{uuid4()}",
        org_id=org_id,
        owner_user_id=user.id,
        visibility=RoadmapBlockVisibility.user,
        lane_category="work",
        block_type="personal",
        title="Blank block",
        description="",
        is_draft=True,
        starred=True,
        creation_date=now,
        update_date=now,
    )
    db_session.add(block)
    db_session.commit()
    db_session.refresh(block)
    instance = RoadmapPathwayBlock(
        pathway_block_uuid=f"roadmap_pathway_block_{uuid4()}",
        pathway_id=pathway.id or 0,
        block_id=block.id or 0,
        start_date=f"{datetime.now(timezone.utc).year}-01",
        creation_date=now,
        update_date=now,
    )
    db_session.add(instance)
    db_session.commit()
    return instance


async def ensure_default_pathway(user: PublicUser, org_id: int, db_session: Session) -> RoadmapPathwayDetailRead:
    require_org_membership(user.id, org_id, db_session)
    existing = db_session.exec(select(RoadmapPathway).where(RoadmapPathway.user_id == user.id, RoadmapPathway.org_id == org_id).order_by(RoadmapPathway.creation_date.asc())).first()
    if existing:
        return _detail_read(existing, user, db_session)
    now = _now()
    pathway = RoadmapPathway(pathway_uuid=f"roadmap_pathway_{uuid4()}", user_id=user.id, org_id=org_id, title=DEFAULT_PATHWAY_TITLE, creation_date=now, update_date=now)
    db_session.add(pathway)
    db_session.commit()
    db_session.refresh(pathway)
    _create_draft_block_and_instance(user, org_id, pathway, db_session)
    db_session.refresh(pathway)
    return _detail_read(pathway, user, db_session)


async def get_pathway(user: PublicUser, org_id: int, pathway_uuid: str, db_session: Session) -> RoadmapPathwayDetailRead:
    return _detail_read(_pathway_or_404(user, org_id, pathway_uuid, db_session), user, db_session)


async def update_pathway(user: PublicUser, org_id: int, pathway_uuid: str, data: RoadmapPathwayUpdate, db_session: Session) -> RoadmapPathwayDetailRead:
    pathway = _pathway_or_404(user, org_id, pathway_uuid, db_session)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(pathway, key, value)
    pathway.update_date = _now()
    db_session.add(pathway)
    db_session.commit()
    db_session.refresh(pathway)
    return _detail_read(pathway, user, db_session)


async def create_pathway_block(user: PublicUser, org_id: int, pathway_uuid: str, data: RoadmapPathwayBlockCreate, db_session: Session) -> RoadmapPathwayDetailRead:
    pathway = _pathway_or_404(user, org_id, pathway_uuid, db_session)
    _validate_dates(data.start_date, data.end_date, data.is_ongoing)
    if data.block_uuid:
        block = _block_or_404(user, org_id, data.block_uuid, db_session)
    else:
        block = RoadmapBlockDefinition(
            block_uuid=f"roadmap_block_{uuid4()}",
            org_id=org_id,
            owner_user_id=user.id,
            visibility=RoadmapBlockVisibility.user,
            lane_category=data.lane_category,
            block_type=data.block_type,
            title=data.title or "Blank block",
            is_draft=not bool(data.title),
            creation_date=_now(),
            update_date=_now(),
        )
        db_session.add(block)
        db_session.commit()
        db_session.refresh(block)
    now = _now()
    instance = RoadmapPathwayBlock(pathway_block_uuid=f"roadmap_pathway_block_{uuid4()}", pathway_id=pathway.id or 0, block_id=block.id or 0, creation_date=now, update_date=now, **data.model_dump(exclude={"block_uuid", "title", "lane_category", "block_type"}))
    db_session.add(instance)
    pathway.update_date = now
    db_session.add(pathway)
    db_session.commit()
    db_session.refresh(pathway)
    return _detail_read(pathway, user, db_session)


async def update_pathway_block(user: PublicUser, org_id: int, pathway_block_uuid: str, data: RoadmapPathwayBlockUpdate, db_session: Session) -> RoadmapPathwayDetailRead:
    pathway, instance = _pathway_block_or_404(user, org_id, pathway_block_uuid, db_session)
    payload = data.model_dump(exclude_unset=True)
    if "block_uuid" in payload:
        block = _block_or_404(user, org_id, payload.pop("block_uuid"), db_session)
        instance.block_id = block.id or 0
    start = payload.get("start_date", instance.start_date)
    end = payload.get("end_date", instance.end_date)
    ongoing = payload.get("is_ongoing", instance.is_ongoing)
    if "start_date" in payload or "end_date" in payload or "is_ongoing" in payload:
        _validate_dates(start, end, ongoing)
    for key, value in payload.items():
        setattr(instance, key, value)
    now = _now()
    instance.update_date = now
    pathway.update_date = now
    db_session.add(instance)
    db_session.add(pathway)
    db_session.commit()
    db_session.refresh(pathway)
    return _detail_read(pathway, user, db_session)


async def delete_pathway_block(user: PublicUser, org_id: int, pathway_block_uuid: str, db_session: Session) -> RoadmapPathwayDetailRead:
    pathway, instance = _pathway_block_or_404(user, org_id, pathway_block_uuid, db_session)
    db_session.delete(instance)
    pathway.update_date = _now()
    db_session.add(pathway)
    db_session.commit()
    db_session.refresh(pathway)
    return _detail_read(pathway, user, db_session)
