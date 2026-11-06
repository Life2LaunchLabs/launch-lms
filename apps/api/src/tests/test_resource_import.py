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
        # The first row is a resource the org has, with a new title and channel: an update, left alone unless asked.
        assert [row["status"] for row in check["rows"]] == ["update", "ready", "repeat", "invalid", "ready"]
        assert check["rows"][0]["changes"] == ["title", "channels"]
        assert (check["ready"], check["updates"], check["duplicates"], check["invalid"], check["new_channels"], check["created"]) == (2, 1, 1, 1, ["Health"], 0)
        assert db.exec(select(Resource)).all().__len__() == 1

        done = await importer.import_rows(None, PLAIN, importer.ImportRequest(rows=rows, dry_run=False), _user(STAFF), db)
        assert done["created"] == 2 and done["updated"] == 0 and len(done["_fill_in"]) == 2
        assert db.get(Resource, 10).title == "Resource 10"
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


@pytest.mark.asyncio
async def test_an_edited_export_updates_what_it_came_from():
    from src.services import resource_export as export

    with _world() as db:
        _channel(db, 1, PLAIN)
        _resource(db, 10, PLAIN, 1)
        _resource(db, 11, PLAIN, 1)
        header, rows = export.export_rows(PLAIN, _user(STAFF), db)
        sheet = [dict(zip(header, row)) for row in rows]
        sheet[0]["Title"], sheet[0]["Starred"], sheet[0]["Link"] = "Resource ten, reworded", "yes", "https://example.com/ten"  # matched by its id
        sheet[1]["Tags"] = "careers"
        sheet.append({"Title": "Brand new", "Link": "https://new.example", "Channel": "Channel 1", "Starred": "x"})
        fields = {name: importer.guess_field(name, set()) for name in header}
        mapped = [{fields[name]: str(value) for name, value in row.items() if fields.get(name, "skip") != "skip" and (value != "" or fields[name] == "starred")} for row in sheet]

        check = await importer.import_rows(None, PLAIN, importer.ImportRequest(rows=mapped), _user(STAFF), db)
        assert [(row["status"], row.get("changes")) for row in check["rows"]] == [("update", ["title", "starred", "link"]), ("update", ["tags"]), ("ready", None)]
        done = await importer.import_rows(None, PLAIN, importer.ImportRequest(rows=mapped, dry_run=False, update_existing=True), _user(STAFF), db)
        assert (done["created"], done["updated"]) == (1, 2)
        ten = db.get(Resource, 10)
        assert (ten.title, ten.is_featured, ten.external_url) == ("Resource ten, reworded", True, "https://example.com/ten")
        assert db.exec(select(Resource).where(Resource.external_url == "https://new.example")).one().is_featured
        assert [tag.name for tag in db.exec(select(ResourceTag)).all()] == ["careers"]
        # Imported again unchanged, every row matches and nothing would change.
        again = await importer.import_rows(None, PLAIN, importer.ImportRequest(rows=mapped), _user(STAFF), db)
        assert [row["status"] for row in again["rows"]] == ["duplicate", "duplicate", "duplicate"]
