"""Connector media: upload by URL or base64 into the org's media library, list it back, refuse private URLs."""

import asyncio
import base64

import pytest

from src.db.media import MediaAsset
from src.services.mcp import media_tools
from src.tests.test_mcp import mcp  # noqa: F401  (fixture)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64


@pytest.fixture
def media_mcp(mcp, monkeypatch, tmp_path):  # noqa: F811
    client, session, rpc, call, alice = mcp
    MediaAsset.__table__.create(session.get_bind())
    monkeypatch.chdir(tmp_path)
    return session, rpc, call


def test_tools_are_listed_with_scopes(media_mcp):
    _, rpc, _ = media_mcp
    tools = {tool["name"]: tool for tool in rpc("tools/list").json()["result"]["tools"]}
    assert tools["upload_media"]["annotations"]["readOnlyHint"] is False
    assert tools["list_media"]["annotations"]["readOnlyHint"] is True


def test_upload_base64_then_list(media_mcp, tmp_path):
    _, _, call = media_mcp
    result = call("upload_media", {"media_type": "image", "data_base64": base64.b64encode(PNG).decode(), "filename": "cover.png", "title": "Cover"})
    assert not result.get("isError"), result
    asset = result["structuredContent"]
    assert asset["url"].startswith("/content/orgs/") and asset["url"].endswith(".png")
    assert asset["folder"] == "Connector" and asset["size_bytes"] == len(PNG)
    assert (tmp_path / asset["url"].lstrip("/")).read_bytes() == PNG
    listed = call("list_media", {"query": "cov"})["structuredContent"]["assets"]
    assert [item["asset_uuid"] for item in listed] == [asset["asset_uuid"]]
    assert call("list_media", {"media_type": "video"})["structuredContent"]["assets"] == []


def test_upload_by_url_names_the_file_from_its_type(media_mcp, monkeypatch):
    _, _, call = media_mcp

    async def fake_download(url, limit):
        assert limit == media_tools.MAX_BYTES[media_tools.MediaType.video]
        return MP4, "video/mp4", "/videos/clip"

    monkeypatch.setattr(media_tools, "download", fake_download)
    asset = call("upload_media", {"media_type": "video", "url": "https://videos.example.com/videos/clip"})["structuredContent"]
    assert asset["url"].endswith(".mp4") and asset["media_type"] == "video"


def test_bad_input_is_refused(media_mcp):
    _, _, call = media_mcp
    assert call("upload_media", {"media_type": "image"})["isError"]
    assert call("upload_media", {"media_type": "image", "data_base64": "not base64!", "filename": "a.png"})["isError"]
    assert call("upload_media", {"media_type": "image", "data_base64": base64.b64encode(PNG).decode()})["isError"]  # no filename
    wrong = call("upload_media", {"media_type": "video", "data_base64": base64.b64encode(PNG).decode(), "filename": "a.png"})
    assert wrong["isError"]  # a png is not a video
    assert call("upload_media", {"media_type": "audio", "url": "https://example.com/a.mp3"})["isError"]


def test_private_addresses_are_refused():
    with pytest.raises(Exception) as error:
        asyncio.run(media_tools.download("http://127.0.0.1/secret.png", 1000))
    assert getattr(error.value, "status_code", None) == 400


def test_filenames():
    assert media_tools._filename("/photos/abc", "image/jpeg", media_tools.MediaType.image) == "abc.jpg"
    assert media_tools._filename("hero.webp", "image/jpeg", media_tools.MediaType.image) == "hero.webp"
    assert media_tools._filename("", "application/pdf", media_tools.MediaType.document) == "connector-document.pdf"
