"""Spreadsheet import: reading .csv and .xlsx, guessing columns, checking rows, and importing into channels (services/resource_import.py)."""

import io

import pytest
from fastapi import HTTPException, UploadFile
from openpyxl import Workbook
from sqlmodel import select

from src.db.resources import Resource, ResourceChannel, ResourceChannelResource, ResourceTag, ResourceTagLink
from src.services import resource_import as importer
from src.tests.test_resource_access import LEARNER, PLAIN, STAFF, _channel, _resource, _user, _world


def _upload(name: str, data: bytes) -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename=name)


def _xlsx(rows: list[list]) -> bytes:
    book = Workbook()
    for row in rows:
        book.active.append(row)
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


@pytest.mark.asyncio
async def test_reads_csv_and_xlsx_and_guesses_columns():
    with _world() as db:
        sheet = [["Resource URL", "Name", "Summary", "Format", "Pathway", "Keywords", "Est. time", "Internal ID"],
                 ["oescareers.org/nursing", "Nursing assistant", "Entry level", "Guide", "Health", "care; entry", 20, "OES-1"]]
        read = await importer.read_spreadsheet(None, PLAIN, _upload("oes.xlsx", _xlsx(sheet)), _user(STAFF), db)
        assert [column["field"] for column in read["columns"]] == ["link", "title", "description", "type", "channel", "tags", "minutes", "skip"]
        assert read["rows"] == [["oescareers.org/nursing", "Nursing assistant", "Entry level", "Guide", "Health", "care; entry", "20", "OES-1"]]

        csv_read = await importer.read_spreadsheet(None, PLAIN, _upload("links.csv", "﻿https://a.org/x,Thing\n\nhttps://b.org,Other\n".encode()), _user(STAFF), db)
        assert [column["field"] for column in csv_read["columns"]] == ["link", "skip"]
        assert len(csv_read["rows"]) == 1  # the first row is the header, even when it holds a link

        with pytest.raises(HTTPException) as denied:
            await importer.read_spreadsheet(None, PLAIN, _upload("links.csv", b"link\nhttps://a.org\n"), _user(LEARNER), db)
        assert denied.value.status_code == 403
        with pytest.raises(HTTPException):
            await importer.read_spreadsheet(None, PLAIN, _upload("links.pdf", b"%PDF"), _user(STAFF), db)


@pytest.mark.asyncio
async def test_dry_run_then_import_into_a_channel_per_column():
    with _world() as db:
        _channel(db, 1, PLAIN)
        _resource(db, 10, PLAIN, 1)  # https://example.com/10 is already the org's
        rows = [
            {"link": "https://example.com/10/", "title": "Old", "channel": "Health"},
            {"link": "oes.org/nurse", "title": "Nurse", "type": "Videos", "channel": "Health | Channel 1", "tags": "care; Entry", "minutes": "1.5 hours"},
            {"link": "https://oes.org/nurse", "title": "Nurse again", "channel": "Health"},
            {"link": "not a link", "title": "Bad"},
            {"link": "https://oes.org/cook", "channel": "health"},
        ]
        check = await importer.import_rows(None, PLAIN, importer.ImportRequest(rows=rows), _user(STAFF), db)
        assert [row["status"] for row in check["rows"]] == ["duplicate", "ready", "repeat", "invalid", "ready"]
        assert (check["ready"], check["duplicates"], check["invalid"], check["new_channels"], check["created"]) == (2, 2, 1, ["Health"], 0)
        assert db.exec(select(Resource)).all().__len__() == 1

        done = await importer.import_rows(None, PLAIN, importer.ImportRequest(rows=rows, dry_run=False), _user(STAFF), db)
        assert done["created"] == 2 and len(done["_fill_in"]) == 2
        nurse = db.exec(select(Resource).where(Resource.external_url == "https://oes.org/nurse")).one()
        assert (nurse.resource_type, nurse.estimated_time, nurse.provider_name) == ("video", 90, "oes.org")
        cook = db.exec(select(Resource).where(Resource.external_url == "https://oes.org/cook")).one()
        assert cook.title == "oes.org"  # filled in from the link after import
        health = db.exec(select(ResourceChannel).where(ResourceChannel.name == "Health")).one()
        in_health = db.exec(select(ResourceChannelResource.resource_id).where(ResourceChannelResource.channel_id == health.id)).all()
        assert set(in_health) == {nurse.id, cook.id}
        assert db.exec(select(ResourceChannelResource).where(ResourceChannelResource.channel_id == 1, ResourceChannelResource.resource_id == nurse.id)).first()
        assert {tag.name for tag in db.exec(select(ResourceTag)).all()} == {"care", "Entry"}
        assert len(db.exec(select(ResourceTagLink).where(ResourceTagLink.resource_id == nurse.id)).all()) == 2


@pytest.mark.asyncio
async def test_import_all_into_one_new_channel():
    with _world() as db:
        rows = [{"link": "https://a.org", "channel": "Ignored"}, {"link": "https://b.org"}]
        done = await importer.import_rows(None, PLAIN, importer.ImportRequest(rows=rows, destination="one", channel_name="Summer jobs", dry_run=False), _user(STAFF), db)
        assert done["created"] == 2 and done["new_channels"] == ["Summer jobs"]
        channels = db.exec(select(ResourceChannel)).all()
        assert [channel.name for channel in channels] == ["Summer jobs"]
        orders = db.exec(select(ResourceChannelResource.sort_order).where(ResourceChannelResource.channel_id == channels[0].id)).all()
        assert sorted(orders) == [1, 2]
        with pytest.raises(HTTPException):
            await importer.import_rows(None, PLAIN, importer.ImportRequest(rows=rows, destination="one"), _user(STAFF), db)
