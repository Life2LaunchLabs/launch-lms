"""Spreadsheet export of an organization's resources (services/resource_export.py)."""

import csv
import io

import pytest
from fastapi import HTTPException
from openpyxl import load_workbook

from src.db.goals import StepEntry
from src.db.resource_library import OrgSavedChannel
from src.db.resources import ResourceComment, ResourceTag, ResourceTagLink, UserSavedResource
from src.services import resource_export as export
from src.services import resource_import as importer
from src.tests.test_resource_access import LEARNER, NOW, PARTNER, PLAIN, STAFF, _channel, _resource, _user, _world


def _setup(db):
    StepEntry.__table__.create(db.get_bind())
    _channel(db, 1, PLAIN)
    _channel(db, 2, PLAIN)
    first = _resource(db, 10, PLAIN, 1, 2)
    first.description, first.provider_name, first.estimated_time = "=HYPERLINK(\"x\")", "OES", 20
    db.add(first)
    second = _resource(db, 11, PLAIN, 2)
    second.resource_type = "video"
    db.add(second)
    _resource(db, 12, PLAIN)  # in no channel
    _resource(db, 13, PARTNER)  # someone else's
    db.add(ResourceTag(id=1, org_id=PLAIN, name="health", tag_uuid="tag_1"))
    db.add(ResourceTagLink(resource_id=10, tag_id=1))
    db.add(UserSavedResource(user_id=LEARNER, resource_id=10, open_count=3))
    db.add(ResourceComment(resource_id=10, author_id=LEARNER, content="Good", rating=4, comment_uuid="c1", creation_date=NOW, update_date=NOW))
    db.add(StepEntry(entry_uuid="e1", step_id=1, kind="resource", resource_uuid="resource_10", data={"opens": 2}))
    db.commit()


def test_simple_export_lists_the_orgs_resources_with_their_channels_and_reimports():
    with _world() as db:
        _setup(db)
        header, rows = export.export_rows(PLAIN, _user(STAFF), db)
        assert header == export.SIMPLE
        assert [row[0] for row in rows] == ["Resource 10", "Resource 11", "Resource 12"]
        assert rows[0] == ["Resource 10", "https://example.com/10", "=HYPERLINK(\"x\")", "guide", "OES", 20, "Channel 1; Channel 2", "health"]
        # Its columns are the ones the importer guesses.
        assert sorted(importer.guess_field(name, set()) for name in header) == sorted(importer.FIELDS)


def test_full_export_adds_usage_and_filters_by_channel_and_type():
    with _world() as db:
        _setup(db)
        header, rows = export.export_rows(PLAIN, _user(STAFF), db, "full", ["channel_2"], ["guide"])
        assert len(header) == len(rows[0]) and [row[0] for row in rows] == ["Resource 10"]
        full = dict(zip(header, rows[0]))
        assert (full["Saves"], full["Opens"], full["Reviews"], full["Average rating"], full["Resource ID"]) == (1, 5, 1, 4.0, "resource_10")

        _, rows = export.export_rows(PLAIN, _user(STAFF), db, channel_uuids=["none"])
        assert [row[0] for row in rows] == ["Resource 12"]

        # A Library channel the org saved can be exported too.
        _channel(db, 3, PARTNER, listed=True)
        _resource(db, 14, PARTNER, 3)
        db.add(OrgSavedChannel(org_id=PLAIN, channel_id=3))
        db.commit()
        _, rows = export.export_rows(PLAIN, _user(STAFF), db, channel_uuids=["channel_3"])
        assert [row[0] for row in rows] == ["Resource 14"]


def test_only_staff_and_known_filters():
    with _world() as db:
        _setup(db)
        for kwargs, code in (({}, 403), ({"channel_uuids": ["channel_404"]}, 404), ({"types": ["poem"]}, 422)):
            with pytest.raises(HTTPException) as error:
                export.export_rows(PLAIN, _user(LEARNER if code == 403 else STAFF), db, **kwargs)
            assert error.value.status_code == code


def test_files_open_and_keep_formulas_as_text():
    with _world() as db:
        _setup(db)
        content, name, media_type = export.export_resources(PLAIN, _user(STAFF), db, "simple", "xlsx")
        assert name.endswith(".xlsx") and media_type.startswith("application/vnd.openxml")
        sheet = load_workbook(io.BytesIO(content)).active
        assert sheet["A1"].value == "Title" and sheet["C2"].value == "'=HYPERLINK(\"x\")"
        content, name, _ = export.export_resources(PLAIN, _user(STAFF), db, "full", "csv", "channel_1,channel_2")
        rows = list(csv.reader(io.StringIO(content.decode("utf-8-sig"))))
        assert name.endswith("-full-" + name.split("-full-")[1]) and rows[0][-1] == "Updated" and len(rows) == 3
