"""Uploads land in the bucket with their content type, the storage check reports a broken bucket, and
the sync script copies local files once."""

import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
from botocore.exceptions import ClientError

from src.services.utils import storage, upload_content


class FakeS3:
    def __init__(self, broken: bool = False):
        self.objects: dict[str, dict] = {}
        self.broken = broken

    def put_object(self, Bucket, Key, Body, ContentType):
        if self.broken:
            raise ClientError({"Error": {"Code": "AccessDenied"}}, "PutObject")
        self.objects[Key] = {"Body": Body, "ContentType": ContentType}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        return {"ContentLength": len(self.objects[Key]["Body"])}

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)


def _use_s3(monkeypatch, client: FakeS3) -> None:
    monkeypatch.setattr(storage, "get_content_delivery_type", lambda: "s3api")
    monkeypatch.setattr(storage, "get_storage_client", lambda: client)
    config = SimpleNamespace(hosting_config=SimpleNamespace(content_delivery=SimpleNamespace(type="s3api")))
    monkeypatch.setattr(upload_content, "get_launchlms_config", lambda: config)


def test_upload_goes_to_the_bucket_with_its_type(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    client = FakeS3()
    _use_s3(monkeypatch, client)
    asyncio.run(upload_content.upload_content("covers", "orgs", "org_1", b"jpeg bytes", "cover.jpg"))
    stored = client.objects["content/orgs/org_1/covers/cover.jpg"]
    assert stored == {"Body": b"jpeg bytes", "ContentType": "image/jpeg"}
    assert not Path("content").exists()  # nothing left behind on the container


def test_failed_upload_is_an_error(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    _use_s3(monkeypatch, FakeS3(broken=True))
    with pytest.raises(Exception) as error:
        asyncio.run(upload_content.upload_content("covers", "orgs", "org_1", b"x", "cover.png"))
    assert getattr(error.value, "status_code", None) == 500


def test_storage_check(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    client = FakeS3()
    _use_s3(monkeypatch, client)
    assert storage.check_storage() == {"type": "s3api", "ok": True}
    assert client.objects == {}  # the probe cleans up after itself
    _use_s3(monkeypatch, FakeS3(broken=True))
    assert storage.check_storage()["ok"] is False


def test_storage_check_on_the_filesystem(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(storage, "get_content_delivery_type", lambda: "filesystem")
    assert storage.check_storage() == {"type": "filesystem", "ok": True}


def test_sync_copies_local_files_once(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    client = FakeS3()
    _use_s3(monkeypatch, client)
    for path in ("content/orgs/org_1/logos/logo.png", "content/users/user_1/avatars/me.webp"):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(b"image")
    spec = importlib.util.spec_from_file_location("sync_content_to_s3", Path(__file__).resolve().parents[2] / "scripts" / "sync_content_to_s3.py")
    script = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script)
    assert script.sync(dry_run=True) == {"copied": 2, "skipped": 0, "failed": [], "dry_run": True}
    assert client.objects == {}
    assert script.sync()["copied"] == 2
    assert client.objects["content/users/user_1/avatars/me.webp"]["ContentType"] == "image/webp"
    assert script.sync()["skipped"] == 2
