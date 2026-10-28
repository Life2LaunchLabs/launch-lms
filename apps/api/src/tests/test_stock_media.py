"""Stock media: Pexels results mapped and cached, imports fetched again by id and stored with their credit."""

import pytest

from src.db.media import MediaAsset
from src.services import stock_media
from src.services.stock_media import pexels
from src.tests.test_mcp import mcp  # noqa: F401  (fixture)
from src.tests.test_mcp_media import MP4, PNG

PHOTO = {"id": 101, "width": 4000, "height": 6000, "url": "https://www.pexels.com/photo/skater-101/", "photographer": "Ana Ruiz",
         "photographer_url": "https://www.pexels.com/@ana", "alt": "Teen skating at sunset",
         "src": {"original": "https://images.pexels.com/101/original.jpeg", "large2x": "https://images.pexels.com/101/large2x.jpeg",
                 "medium": "https://images.pexels.com/101/medium.jpeg"}}
VIDEO = {"id": 202, "width": 3840, "height": 2160, "duration": 12, "url": "https://www.pexels.com/video/friends-laughing-on-a-roof-202/",
         "image": "https://images.pexels.com/videos/202/poster.jpeg", "user": {"name": "Sam Lee", "url": "https://www.pexels.com/@sam"},
         "video_files": [
             {"file_type": "video/mp4", "height": 2160, "width": 3840, "link": "https://videos.pexels.com/202/uhd.mp4"},
             {"file_type": "video/mp4", "height": 1080, "width": 1920, "link": "https://videos.pexels.com/202/hd.mp4"},
             {"file_type": "video/mp4", "height": 540, "width": 960, "link": "https://videos.pexels.com/202/sd.mp4"},
         ]}


@pytest.fixture
def stock(mcp, monkeypatch, tmp_path):  # noqa: F811
    client, session, rpc, call, alice = mcp
    MediaAsset.__table__.create(session.get_bind())
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv(pexels.KEY_ENV, "test-key")
    stock_media._cache.clear()
    requests, downloads = [], []

    async def fake_get(path, params=None):
        requests.append((path, params))
        if path == "/v1/search":
            return {"photos": [PHOTO], "total_results": 1, "next_page": None}
        if path == "/videos/search":
            return {"videos": [VIDEO], "total_results": 1, "next_page": "https://api.pexels.com/videos/search?page=2"}
        return {"/v1/photos/101": PHOTO, "/videos/videos/202": VIDEO}[path]

    async def fake_download(url, limit):
        downloads.append(url)
        return (MP4, "video/mp4", "/202/hd.mp4") if url.endswith(".mp4") else (PNG, "image/png", "/101/large2x.png")

    monkeypatch.setattr(pexels, "_get", fake_get)
    monkeypatch.setattr(stock_media, "download", fake_download)
    return call, requests, downloads


def test_search_maps_results_and_caches(stock):
    call, requests, _ = stock
    photos = call("search_stock_media", {"query": "teen skating", "orientation": "portrait"})["structuredContent"]
    assert photos["items"][0]["id"] == "101" and photos["items"][0]["preview_url"].endswith("medium.jpeg")
    assert photos["items"][0]["credit"]["name"] == "Ana Ruiz"
    call("search_stock_media", {"query": "Teen skating ", "orientation": "portrait"})
    assert len(requests) == 1 and requests[0][1]["orientation"] == "portrait"  # the second search came from the cache
    videos = call("search_stock_media", {"query": "friends", "kind": "video"})["structuredContent"]
    assert videos["has_more"] is True
    assert videos["items"][0]["download_url"].endswith("hd.mp4")  # the 1080p file, not the 4K one
    assert videos["items"][0]["duration"] == 12 and videos["items"][0]["alt"] == "Friends laughing on a roof"


def test_import_fetches_by_id_and_keeps_the_credit(stock):
    call, requests, downloads = stock
    photo = call("add_stock_media", {"id": "101"})["structuredContent"]
    assert requests[-1][0] == "/v1/photos/101" and downloads == ["https://images.pexels.com/101/large2x.jpeg"]
    assert photo["folder"] == "Stock" and photo["title"] == "Teen skating at sunset" and photo["url"].endswith(".png")
    assert photo["credit"] == {"provider": "Pexels", "name": "Ana Ruiz", "url": "https://www.pexels.com/@ana", "source_url": PHOTO["url"]}
    video = call("add_stock_media", {"id": "202", "kind": "video", "folder": "Hooks"})["structuredContent"]
    assert video["media_type"] == "video" and video["folder"] == "Hooks" and video["url"].endswith(".mp4")


def test_bad_requests(stock, monkeypatch):
    call, *_ = stock
    assert call("search_stock_media", {"query": " "})["isError"]
    assert call("search_stock_media", {"query": "x", "kind": "gif"})["isError"]
    assert call("search_stock_media", {"query": "x", "orientation": "wide"})["isError"]
    assert call("add_stock_media", {"id": "../../v1/curated"})["isError"]
    monkeypatch.delenv(pexels.KEY_ENV)
    missing = call("search_stock_media", {"query": "x"})
    assert missing["isError"] and "PEXELS_API_KEY" in missing["content"][0]["text"]


def test_best_video_file_falls_back_to_the_smallest():
    files = [{"file_type": "video/mp4", "height": 2160, "link": "a"}, {"file_type": "video/mp4", "height": 1440, "link": "b"}]
    assert pexels._best_file(files)["link"] == "b"
    assert pexels._best_file([{"file_type": "video/webm", "height": 720, "link": "c"}]) is None
