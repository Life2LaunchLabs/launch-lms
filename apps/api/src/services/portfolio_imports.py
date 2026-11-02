"""Bringing a learner's history in from another app: a preview to pick from, then a one-time copy.

Nothing stays synced. Every record keeps ``source`` and the item's key as ``source_reference``, so importing the
same export again adds only what's new. The raw rows of the sheets plans own are kept with the import."""

import io
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlmodel import Session, select
from starlette.datastructures import Headers

from src.db.media import MediaOwnerType, MediaType
from src.db.portfolio import PortfolioLink, PortfolioVisibility, ProjectItem, ProjectItemCreate, TimelineEntry, TimelineEntryCreate
from src.db.portfolio_records import (
    ContactWrite,
    Credential,
    CredentialWrite,
    PortfolioContact,
    PortfolioDocument,
    PortfolioImport,
    PortfolioQuote,
    PortfolioResult,
    QuoteStatus,
    ResultWrite,
)
from src.db.users import PublicUser
from src.services import media as media_service
from src.services import portfolio as portfolio_service
from src.services import portfolio_records as records
from src.services import portfolio_results
from src.services.portfolio_import_sources import read_export

SOURCE_LABELS = {"cis": "Oregon CIS", "linkedin": "LinkedIn", "resume": "résumé"}
MIME = {"pdf": "application/pdf", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}


async def _read(upload: UploadFile) -> tuple[bytes, str]:
    content = await upload.read()
    if not content:
        raise HTTPException(status_code=400, detail="No file provided")
    return content, upload.filename or "export"


def _existing(portfolio_id: int, source: str, db_session: Session) -> set[str]:
    keys: set[str] = set()
    for model in (TimelineEntry, ProjectItem, Credential, PortfolioContact, PortfolioResult):
        keys |= {row for row in db_session.exec(select(model.source_reference).where(model.portfolio_id == portfolio_id)).all() if row}
    keys |= {f"doc:{title}" for title in db_session.exec(select(PortfolioDocument.title).where(PortfolioDocument.portfolio_id == portfolio_id, PortfolioDocument.source == source)).all()}
    keys |= {f"url:{url}" for url in db_session.exec(select(PortfolioLink.url).where(PortfolioLink.portfolio_id == portfolio_id)).all()}
    return keys


def _already(item: dict, existing: set[str]) -> bool:
    if item["kind"] == "document":
        return f"doc:{item['title']}" in existing
    if item["kind"] == "link":
        return f"url:{item['record']['url']}" in existing
    return item["key"] in existing


async def preview_import(source: str, upload: UploadFile, current_user: PublicUser, db_session: Session) -> dict:
    content, filename = await _read(upload)
    export = read_export(source, content, filename)
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    existing = _existing(portfolio.id or 0, source, db_session)
    items = [{key: item[key] for key in ("key", "group", "kind", "title", "detail")} | {"already": _already(item, existing)} for item in export["items"]]
    return {"source": source, "label": SOURCE_LABELS[source], "items": items, "kept": {sheet: len(rows) for sheet, rows in export["kept"].items()}, "skipped": export["skipped"]}


def _timeline(record: dict, key: str, source: str, current_user: PublicUser, db_session: Session) -> None:
    created = portfolio_service.create_timeline(TimelineEntryCreate(**record, idempotency_key=key), current_user, db_session)
    row = db_session.exec(select(TimelineEntry).where(TimelineEntry.timeline_uuid == created["timeline_uuid"])).one()
    row.source = source
    db_session.add(row)


def _project(record: dict, key: str, source: str, current_user: PublicUser, db_session: Session) -> None:
    created = portfolio_service.create_project(ProjectItemCreate(**record, idempotency_key=key), current_user, db_session)
    row = db_session.exec(select(ProjectItem).where(ProjectItem.project_uuid == created["project_uuid"])).one()
    row.source = source
    db_session.add(row)


def _credential(record: dict, key: str, source: str, portfolio, current_user: PublicUser, db_session: Session) -> None:
    item = Credential(credential_uuid=f"crd_{uuid4().hex}", portfolio_id=portfolio.id or 0, kind=record["kind"], name="", source=source, source_reference=key)
    record = {field: value for field, value in record.items() if value is not None}
    records._apply_credential(item, CredentialWrite(**record), current_user, portfolio, db_session)
    item.creation_date = item.update_date = portfolio_service._now()
    db_session.add(item)


def _contact(record: dict, key: str, source: str, portfolio, db_session: Session) -> None:
    fields = {"name": 160, "role_label": 200, "email": 320, "phone": 40, "note": 2000}
    payload = ContactWrite(**{field: (record.get(field) or "")[:size] for field, size in fields.items()}, is_reference=record.get("is_reference", False))
    now = portfolio_service._now()
    item = PortfolioContact(contact_uuid=f"ctc_{uuid4().hex}", portfolio_id=portfolio.id or 0, name="", source=source, source_reference=key, creation_date=now, update_date=now)
    records._apply_contact(item, payload, portfolio, db_session)
    db_session.add(item)
    if record.get("quote"):
        db_session.flush()
        db_session.add(PortfolioQuote(quote_uuid=f"qte_{uuid4().hex}", portfolio_id=portfolio.id or 0, contact_id=item.id or 0, body=record["quote"][:2000], status=QuoteStatus.SELF_REPORTED.value, creation_date=now, update_date=now))


def _link(record: dict, portfolio, db_session: Session) -> None:
    now = portfolio_service._now()
    db_session.add(PortfolioLink(link_uuid=f"lnk_{uuid4().hex}", portfolio_id=portfolio.id or 0, link_type="other", label=record["label"], url=record["url"], visibility=PortfolioVisibility.PUBLIC, safety_status="pending", creation_date=now, update_date=now))


async def _document(item: dict, files: dict, source: str, portfolio, current_user: PublicUser, db_session: Session) -> None:
    record = item["record"]
    extension = record["filename"].rsplit(".", 1)[-1].lower()
    upload = UploadFile(file=io.BytesIO(files[record["member"]]), filename=record["filename"], headers=Headers({"content-type": MIME.get(extension, "application/octet-stream")}))
    asset = await media_service.upload_media_asset(MediaOwnerType.user, current_user.id, MediaType(record["media_type"]), upload, current_user, db_session, title=item["title"], folder=f"From {SOURCE_LABELS[source]}", commit=False)
    now = portfolio_service._now()
    db_session.add(PortfolioDocument(document_uuid=f"doc_{uuid4().hex}", portfolio_id=portfolio.id or 0, kind=record["kind"], title=item["title"], media_asset_id=asset.id, source=source, creation_date=now, update_date=now))


async def run_import(source: str, upload: UploadFile, keys: list[str], current_user: PublicUser, db_session: Session) -> dict:
    content, filename = await _read(upload)
    export = read_export(source, content, filename)
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    existing = _existing(portfolio.id or 0, source, db_session)
    wanted = set(keys)
    added: dict[str, int] = {}
    for item in export["items"]:
        if item["key"] not in wanted or _already(item, existing):
            continue
        kind, record, key = item["kind"], item["record"], item["key"]
        if kind == "timeline":
            _timeline(record, key, source, current_user, db_session)
        elif kind == "project":
            _project(record, key, source, current_user, db_session)
        elif kind == "credential":
            _credential(record, key, source, portfolio, current_user, db_session)
        elif kind == "contact":
            _contact(record, key, source, portfolio, db_session)
        elif kind == "result":
            portfolio_results.record_result(current_user, ResultWrite(**record), source, key, db_session)
        elif kind == "link":
            _link(record, portfolio, db_session)
        elif kind == "document":
            await _document(item, export["files"], source, portfolio, current_user, db_session)
        added[item["group"]] = added.get(item["group"], 0) + 1
    now = portfolio_service._now()
    entry = PortfolioImport(import_uuid=f"imp_{uuid4().hex}", portfolio_id=portfolio.id or 0, source=source, filename=filename[:200], added=added, kept=export["kept"], creation_date=now, update_date=now)
    db_session.add(entry)
    portfolio_service._save(portfolio, db_session, now)
    return {"import_uuid": entry.import_uuid, "added": added, "kept": {sheet: len(rows) for sheet, rows in export["kept"].items()}}


def list_imports(current_user: PublicUser, db_session: Session) -> list[dict]:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    rows = db_session.exec(select(PortfolioImport).where(PortfolioImport.portfolio_id == portfolio.id).order_by(PortfolioImport.id.desc())).all()  # type: ignore[union-attr]
    return [{"import_uuid": row.import_uuid, "source": row.source, "label": SOURCE_LABELS.get(row.source, row.source), "filename": row.filename, "added": row.added, "kept": {sheet: len(kept) for sheet, kept in (row.kept or {}).items()}, "creation_date": row.creation_date} for row in rows]
