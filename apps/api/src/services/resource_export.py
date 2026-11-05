"""An organization's resources as a spreadsheet, for staff: simple (what each one is and where it goes) or full.

Simple columns match what the importer reads (``resource_import.FIELDS``), so a simple export can be
edited and brought back in. Full adds the rest: cost, cover, flags, ids, dates, and how learners use it
(saves, opens from Discover and plan steps, reviews, average rating). Rows can be narrowed to some channels (the org's own and the
Library channels it saved; ``none`` stands for resources in no channel) and some types.
"""

from __future__ import annotations

import csv
import io
import re
from collections import defaultdict
from datetime import date
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.resources import (
    CommentStatus,
    Resource,
    ResourceChannelResource,
    ResourceComment,
    ResourceTag,
    ResourceTagLink,
    ResourceTypeEnum,
    UserSavedResource,
)
from src.db.goals import StepEntry
from src.db.users import PublicUser
from src.services import resources as base

NO_CHANNEL = "none"
SIMPLE = ["Title", "Link", "Description", "Type", "Provider", "Minutes", "Channel", "Tags"]
FULL = [*SIMPLE, "Cost", "Featured", "Live", "Provider site", "Cover image", "Saves", "Opens", "Reviews", "Average rating", "Resource ID", "Created", "Updated"]
MIME = {"xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "csv": "text/csv; charset=utf-8"}


def _value(item) -> str:
    return str(getattr(item, "value", item) or "")


def _split(value: str | None) -> list[str]:
    return [part.strip() for part in (value or "").split(",") if part.strip()]


def _day(stamp: str | None) -> str:
    return (stamp or "")[:10]


def export_rows(org_id: int, current_user: PublicUser, db_session: Session, detail: Literal["simple", "full"] = "simple",
                channel_uuids: list[str] | None = None, types: list[str] | None = None) -> tuple[list[str], list[list]]:
    base._get_org_or_404(org_id, db_session)
    base._require_staff(current_user, org_id, db_session)
    channels = base._org_channels(org_id, db_session)
    by_uuid = {channel.channel_uuid: channel for channel in channels}
    wanted = set(channel_uuids or [])
    unknown = wanted - set(by_uuid) - {NO_CHANNEL}
    if unknown:
        raise HTTPException(status_code=404, detail=f"Channel not found: {sorted(unknown)[0]}")
    bad_types = set(types or []) - {item.value for item in ResourceTypeEnum}
    if bad_types:
        raise HTTPException(status_code=422, detail=f"Unknown resource type: {sorted(bad_types)[0]}")

    channel_ids = {int(channel.id): channel for channel in channels}  # type: ignore[arg-type]
    filed: dict[int, list[str]] = defaultdict(list)
    placed = db_session.exec(select(ResourceChannelResource).where(ResourceChannelResource.channel_id.in_(list(channel_ids)))).all() if channel_ids else []  # type: ignore[attr-defined]
    for row in sorted(placed, key=lambda item: (item.channel_id, item.sort_order, item.id or 0)):
        filed[int(row.resource_id)].append(channel_ids[int(row.channel_id)].name)
    in_wanted = {int(row.resource_id) for row in placed if channel_ids[int(row.channel_id)].channel_uuid in wanted}

    # The org's own resources, plus what sits in the Library channels it saved when those are asked for.
    query = select(Resource).where((Resource.org_id == org_id) | (Resource.id.in_(in_wanted or {-1})))  # type: ignore[attr-defined]
    if types:
        query = query.where(Resource.resource_type.in_(types))  # type: ignore[attr-defined]
    resources = db_session.exec(query.order_by(Resource.title)).all()
    if wanted:
        resources = [item for item in resources if int(item.id) in in_wanted or (NO_CHANNEL in wanted and not filed.get(int(item.id)))]  # type: ignore[arg-type]

    ids = [int(item.id) for item in resources]  # type: ignore[arg-type]
    tags: dict[int, list[str]] = defaultdict(list)
    if ids:
        for resource_id, name in db_session.exec(select(ResourceTagLink.resource_id, ResourceTag.name).join(ResourceTag, ResourceTag.id == ResourceTagLink.tag_id).where(ResourceTagLink.resource_id.in_(ids))).all():  # type: ignore[attr-defined]
            tags[int(resource_id)].append(name)
    usage: dict[int, tuple[int, int]] = {}
    reviews: dict[int, tuple[int, float | None]] = {}
    if detail == "full" and ids:
        for resource_id, saves, opens in db_session.exec(select(UserSavedResource.resource_id, func.count(), func.coalesce(func.sum(UserSavedResource.open_count), 0)).where(UserSavedResource.resource_id.in_(ids)).group_by(UserSavedResource.resource_id)).all():  # type: ignore[attr-defined]
            usage[int(resource_id)] = (int(saves), int(opens))
        # Opens from Resources plan steps count too; they're kept on the step, not the learner's library.
        by_uuid_id = {item.resource_uuid: int(item.id) for item in resources}  # type: ignore[arg-type]
        for resource_uuid, data in db_session.exec(select(StepEntry.resource_uuid, StepEntry.data).where(StepEntry.kind == "resource", StepEntry.resource_uuid.in_(list(by_uuid_id)))).all():  # type: ignore[union-attr]
            key = by_uuid_id[resource_uuid]
            saves, opens = usage.get(key, (0, 0))
            usage[key] = (saves, opens + int((data or {}).get("opens") or 0))
        for resource_id, count, average in db_session.exec(
            select(ResourceComment.resource_id, func.count(ResourceComment.rating), func.avg(ResourceComment.rating))
            .where(ResourceComment.resource_id.in_(ids), ResourceComment.rating.is_not(None), ResourceComment.status == CommentStatus.live)  # type: ignore[attr-defined, union-attr]
            .group_by(ResourceComment.resource_id)
        ).all():
            reviews[int(resource_id)] = (int(count), round(float(average), 1) if average is not None else None)

    rows: list[list] = []
    for item in resources:
        key = int(item.id)  # type: ignore[arg-type]
        row: list = [item.title or "", item.external_url or "", item.description or "", _value(item.resource_type), item.provider_name or "",
                     item.estimated_time if item.estimated_time is not None else "", "; ".join(filed.get(key, [])), "; ".join(sorted(tags.get(key, []), key=str.lower))]
        if detail == "full":
            saves, opens = usage.get(key, (0, 0))
            count, average = reviews.get(key, (0, None))
            row += [_value(item.access_mode), "yes" if item.is_featured else "", "yes" if item.is_live else "", item.provider_url or "", item.cover_image_url or "",
                    saves, opens, count, average if average is not None else "", item.resource_uuid, _day(item.creation_date), _day(item.update_date)]
        rows.append(row)
    return (FULL if detail == "full" else SIMPLE), rows


def _safe(cell):
    """A text cell that a spreadsheet would run as a formula starts with a quote mark instead."""
    if isinstance(cell, str) and cell[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + cell
    return cell


def render(header: list[str], rows: list[list], file_format: Literal["xlsx", "csv"]) -> bytes:
    if file_format == "csv":
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(header)
        writer.writerows([[_safe(cell) for cell in row] for row in rows])
        return ("﻿" + out.getvalue()).encode("utf-8")
    from openpyxl import Workbook
    from openpyxl.styles import Font

    book = Workbook()
    sheet = book.active
    sheet.title = "Resources"
    sheet.append(header)
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    for row in rows:
        sheet.append([_safe(cell) for cell in row])
    sheet.freeze_panes = "A2"
    widths = {"Title": 40, "Link": 45, "Description": 60, "Channel": 28, "Tags": 28, "Cover image": 40, "Provider site": 35, "Resource ID": 44}
    for index, name in enumerate(header, start=1):
        sheet.column_dimensions[sheet.cell(row=1, column=index).column_letter].width = widths.get(name, 14)
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def filename(org_slug: str | None, detail: str, file_format: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (org_slug or "org").lower()).strip("-") or "org"
    return f"{slug}-resources{'-full' if detail == 'full' else ''}-{date.today().isoformat()}.{file_format}"


def export_resources(org_id: int, current_user: PublicUser, db_session: Session, detail: Literal["simple", "full"] = "simple",
                     file_format: Literal["xlsx", "csv"] = "xlsx", channels: str | None = None, types: str | None = None) -> tuple[bytes, str, str]:
    """The file's bytes, its name and its media type."""
    header, rows = export_rows(org_id, current_user, db_session, detail, _split(channels), _split(types))
    org = base._get_org_or_404(org_id, db_session)
    return render(header, rows, file_format), filename(getattr(org, "slug", None), detail, file_format), MIME[file_format]
