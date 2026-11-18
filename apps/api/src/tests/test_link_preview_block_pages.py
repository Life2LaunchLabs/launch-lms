"""Link previews must not offer a bot-wall or error page's title as a resource title (DEV-62)."""

import httpx
import pytest
from fastapi import HTTPException

from src.services import resources
from src.services.utils import link_preview
from src.services.utils.link_preview import fetch_link_preview, is_block_page

BLOCKED_URL = "https://www.bls.gov/ooh/healthcare/veterinary-technologists-and-technicians.htm"
NORMAL_URL = "https://example.org/careers/vet-tech"


def _serve(monkeypatch, status: int, html: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, headers={"content-type": "text/html; charset=utf-8"}, text=html)

    real_client = httpx.AsyncClient

    def client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(link_preview, "_validate_url", lambda url: url)
    monkeypatch.setattr(link_preview.httpx, "AsyncClient", client)


@pytest.mark.asyncio
async def test_access_denied_page_leaves_title_empty(monkeypatch):
    _serve(monkeypatch, 403, "<html><head><title>Access Denied</title></head><body>Reference #18</body></html>")
    # Nothing usable is left, so the preview fails and the Add resource form keeps Title empty.
    with pytest.raises(HTTPException) as error:
        await fetch_link_preview(BLOCKED_URL)
    assert error.value.status_code == 400


@pytest.mark.asyncio
async def test_challenge_page_with_ok_status_leaves_title_empty(monkeypatch):
    _serve(monkeypatch, 200, "<html><head><title>Just a moment...</title></head></html>")
    preview = await fetch_link_preview(NORMAL_URL)
    assert preview["title"] is None
    assert preview["description"] is None


@pytest.mark.asyncio
async def test_normal_page_still_fills_its_title(monkeypatch):
    _serve(
        monkeypatch,
        200,
        '<html><head><title>Veterinary Technologists and Technicians</title>'
        '<meta name="description" content="What they do"></head></html>',
    )
    preview = await fetch_link_preview(NORMAL_URL)
    assert preview["title"] == "Veterinary Technologists and Technicians"
    assert preview["description"] == "What they do"


@pytest.mark.parametrize(
    "title",
    ["Access Denied", "403 Forbidden", "Forbidden", "Just a moment...", "Attention Required! | Cloudflare",
     "Error 403", "404 Not Found", "Are you a robot?", "  access   denied  "],
)
def test_block_page_titles_are_recognized(title):
    assert is_block_page(200, title)


@pytest.mark.parametrize(
    "title",
    ["Veterinary Technologists and Technicians", "100 Best Jobs of 2026", "Access to Higher Education",
     "500 Startups", "Forbidden Planet (1956)", "Error Handling in Python"],
)
def test_real_titles_are_kept(title):
    assert not is_block_page(200, title)


def test_non_2xx_status_is_a_block_page():
    assert is_block_page(403, "Some Title")
    assert is_block_page(503, None)


def test_note_link_enrichment_skips_block_page_titles(monkeypatch):
    class FakeResponse:
        headers = {"Content-Type": "text/html"}

        def read(self, _size):
            return b"<html><head><title>Just a moment...</title></head></html>"

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(resources, "urlopen", lambda req, timeout: FakeResponse())
    data = resources.enrich_resource_metadata(NORMAL_URL)
    assert data["title"] is None
    assert data["provider_name"] == "example.org"
