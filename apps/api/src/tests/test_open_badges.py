import pytest
from fastapi import HTTPException

from src.db.learning import OpenBadgeImport
from src.services import open_badges


BADGE_JSON = {
    "type": "BadgeClass",
    "id": "https://api.badgr.io/public/badges/example",
    "@context": "https://w3id.org/openbadges/v2",
    "name": "Collaboration Badge",
    "image": {"id": "https://api.badgr.io/public/badges/example/image"},
    "description": "Collaboration skills",
    "issuer": "https://api.badgr.io/public/issuers/example",
    "criteria": {"narrative": "Pass the assessment with 80% or higher."},
}


def test_parse_open_badge_maps_badgr_badge_class():
    parsed = open_badges.parse_open_badge(BADGE_JSON)

    assert parsed == {
        "name": "Collaboration Badge",
        "description": "Collaboration skills",
        "criteria": "Pass the assessment with 80% or higher.",
        "image_url": "https://api.badgr.io/public/badges/example/image",
        "issuer_url": "https://api.badgr.io/public/issuers/example",
        "source_id": "https://api.badgr.io/public/badges/example",
    }


def test_parse_open_badge_rejects_unrelated_json():
    with pytest.raises(HTTPException, match="BadgeClass or Achievement"):
        open_badges.parse_open_badge({"type": "Assertion", "name": "Not a badge class"})


@pytest.mark.asyncio
async def test_downloaded_badge_image_is_created_as_org_media(monkeypatch):
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 20

    async def fake_fetch(_url, *, max_bytes):
        assert max_bytes == open_badges._MAX_IMAGE_BYTES
        return png, "image/png", "https://cdn.example.org/image"

    captured = {}

    async def fake_upload(owner_type, owner_id, media_type, upload, current_user, db_session, **kwargs):
        captured.update(
            owner_type=owner_type,
            owner_id=owner_id,
            media_type=media_type,
            filename=upload.filename,
            content=upload.file.read(),
            kwargs=kwargs,
        )
        return object()

    monkeypatch.setattr(open_badges, "_fetch", fake_fetch)
    monkeypatch.setattr(open_badges.media_service, "upload_media_asset", fake_upload)

    await open_badges._download_image_to_library(
        "https://cdn.example.org/image", 7, "Collaboration", object(), object()
    )

    assert captured["owner_type"].value == "org"
    assert captured["owner_id"] == 7
    assert captured["media_type"].value == "image"
    assert captured["filename"] == "badge.png"
    assert captured["content"] == png
    assert captured["kwargs"]["folder"] == "Badge imports"
    assert captured["kwargs"]["commit"] is False


@pytest.mark.asyncio
async def test_import_preserves_source_and_resolved_issuer_metadata(monkeypatch):
    class Asset:
        url = "/content/orgs/org-1/media/badge.png"

        def model_dump(self):
            return {"url": self.url}

    class Badge:
        def model_dump(self):
            return {"badge_uuid": "badge-new"}

    async def fake_issuer(_url):
        return {"type": "Issuer", "name": "Original issuer"}

    async def fake_image(*_args):
        return Asset()

    captured = {}

    async def fake_create(_request, data, _user, _session):
        captured["data"] = data
        return Badge()

    monkeypatch.setattr(open_badges.learning_service, "_require_org_admin", lambda *_args: None)
    monkeypatch.setattr(open_badges, "_fetch_issuer", fake_issuer)
    monkeypatch.setattr(open_badges, "_download_image_to_library", fake_image)
    monkeypatch.setattr(open_badges.learning_service, "create_badge", fake_create)

    result = await open_badges.import_open_badge(
        object(),
        OpenBadgeImport(org_id=1, collection_id=4, badge=BADGE_JSON),
        object(),
        object(),
    )

    created = captured["data"]
    provenance = created.badge_metadata["open_badges_import"]
    assert created.collection_id == 4
    assert created.thumbnail_image == Asset.url
    assert created.criteria == BADGE_JSON["criteria"]["narrative"]
    assert provenance["source_id"] == BADGE_JSON["id"]
    assert provenance["badge_class"] == BADGE_JSON
    assert provenance["issuer"]["name"] == "Original issuer"
    assert result["warnings"] == []
