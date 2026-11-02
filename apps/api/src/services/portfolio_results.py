"""Results for "What I'm like": typed in by the learner, imported, or written by a plan activity.

A plan activity calls ``record_result`` with its own ``source`` and ``source_reference``; taking it again
updates that row instead of adding another. The learner can still hide, feature or remove it."""

from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.portfolio import Portfolio, PortfolioVisibility
from src.db.portfolio_records import PortfolioResult, ResultWrite
from src.db.users import PublicUser
from src.services import portfolio as portfolio_service

RESULT_KINDS = {"interests", "strengths", "values", "skills", "other"}


def _value(item) -> str:
    return item.value if hasattr(item, "value") else str(item)


def result_dto(item: PortfolioResult, public_only: bool = False) -> dict:
    dto = {
        "result_uuid": item.result_uuid, "kind": item.kind, "name": item.name, "summary": item.summary,
        "data": item.data or {}, "taken_on": item.taken_on, "featured": item.featured, "source": item.source,
    }
    return dto if public_only else dto | {"visibility": _value(item.visibility), "source_reference": item.source_reference}


def results_for_shell(portfolio: Portfolio, db_session: Session, public_only: bool = False) -> list[dict]:
    rows = db_session.exec(select(PortfolioResult).where(PortfolioResult.portfolio_id == portfolio.id).order_by(PortfolioResult.sort_order, PortfolioResult.id)).all()
    if public_only:
        rows = [row for row in rows if _value(row.visibility) != PortfolioVisibility.PRIVATE.value]
    return [result_dto(row, public_only) for row in rows]


def _apply(item: PortfolioResult, payload: ResultWrite) -> None:
    values = payload.model_dump(exclude_unset=True)
    if values.get("kind"):
        if values["kind"] not in RESULT_KINDS:
            raise HTTPException(status_code=422, detail="Unknown kind of result")
        item.kind = values["kind"]
    for field in ("name", "summary"):
        if field in values:
            setattr(item, field, (values[field] or "").strip())
    if "data" in values:
        item.data = values["data"] or {}
    if "taken_on" in values:
        item.taken_on = values["taken_on"] or None
    for field in ("featured", "visibility"):
        if values.get(field) is not None:
            setattr(item, field, values[field])
    if not item.name:
        raise HTTPException(status_code=422, detail="Name is required")


def _owned(result_uuid: str, portfolio: Portfolio, db_session: Session) -> PortfolioResult:
    row = db_session.exec(select(PortfolioResult).where(PortfolioResult.result_uuid == result_uuid, PortfolioResult.portfolio_id == portfolio.id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row


def _commit(item: PortfolioResult, portfolio: Portfolio, db_session: Session) -> dict:
    now = portfolio_service._now()
    item.update_date = now
    item.creation_date = item.creation_date or now
    db_session.add(item)
    portfolio_service._save(portfolio, db_session, now)
    db_session.refresh(item)
    return result_dto(item)


def create_result(payload: ResultWrite, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = PortfolioResult(result_uuid=f"res_{uuid4().hex}", portfolio_id=portfolio.id or 0, kind=payload.kind or "other", name="")
    _apply(item, payload)
    return _commit(item, portfolio, db_session)


def update_result(result_uuid: str, payload: ResultWrite, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = _owned(result_uuid, portfolio, db_session)
    _apply(item, payload)
    return _commit(item, portfolio, db_session)


def delete_result(result_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    db_session.delete(_owned(result_uuid, portfolio, db_session))
    db_session.commit()
    return {"deleted": True}


def record_result(current_user: PublicUser, payload: ResultWrite, source: str, source_reference: str, db_session: Session) -> dict:
    """For plan activities: adds the learner's result, or updates the one this source wrote before. A result the
    learner hid stays hidden."""
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = db_session.exec(select(PortfolioResult).where(PortfolioResult.portfolio_id == portfolio.id, PortfolioResult.source == source, PortfolioResult.source_reference == source_reference)).first()
    if item:
        payload = payload.model_copy(update={"visibility": None, "featured": None})
    else:
        item = PortfolioResult(result_uuid=f"res_{uuid4().hex}", portfolio_id=portfolio.id or 0, kind=payload.kind or "other", name="", source=source, source_reference=source_reference)
    _apply(item, payload)
    return _commit(item, portfolio, db_session)
