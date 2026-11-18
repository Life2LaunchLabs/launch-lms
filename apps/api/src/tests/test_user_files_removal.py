"""Deleting an account removes the person's own uploads (content/users/<uuid>/) and nothing else (DEV-56)."""

from pathlib import Path

from botocore.exceptions import ClientError
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.organizations import Organization  # noqa: F401  (tables for the user's foreign keys)
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.superadmin import users as superadmin_users
from src.services.users import files
from src.services.utils import storage


class FakeS3:
    def __init__(self, keys: list[str], broken: bool = False):
        self.objects = {key: b"x" for key in keys}
        self.broken = broken

    def get_paginator(self, _name):
        client = self

        class Pages:
            def paginate(self, Bucket, Prefix):
                if client.broken:
                    raise ClientError({"Error": {"Code": "AccessDenied"}}, "ListObjectsV2")
                yield {"Contents": [{"Key": key} for key in client.objects if key.startswith(Prefix)]}

        return Pages()

    def delete_objects(self, Bucket, Delete):
        for item in Delete["Objects"]:
            self.objects.pop(item["Key"], None)


def _write(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(b"x")


def test_filesystem_removes_only_that_persons_folder(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(storage, "get_content_delivery_type", lambda: "filesystem")
    _write("content/users/user_a/avatars/me.png")
    _write("content/users/user_a/media/essay.pdf")
    _write("content/users/user_ab/media/other.pdf")  # a uuid that starts the same way
    _write("content/orgs/org_1/logos/logo.png")
    assert files.remove_user_files("user_a") is True
    assert not Path("content/users/user_a").exists()
    assert Path("content/users/user_ab/media/other.pdf").exists()
    assert Path("content/orgs/org_1/logos/logo.png").exists()


def test_s3_removes_only_that_persons_keys(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    client = FakeS3([
        "content/users/user_a/avatars/me.png",
        "content/users/user_a/resources/r1/notes/n.png",
        "content/users/user_ab/media/other.pdf",
        "content/orgs/org_1/logos/logo.png",
    ])
    monkeypatch.setattr(storage, "get_content_delivery_type", lambda: "s3api")
    monkeypatch.setattr(storage, "get_storage_client", lambda: client)
    monkeypatch.setattr(storage, "get_s3_bucket_name", lambda: "bucket")
    assert files.remove_user_files("user_a") is True
    assert sorted(client.objects) == ["content/orgs/org_1/logos/logo.png", "content/users/user_ab/media/other.pdf"]


def test_unexpected_uuid_removes_nothing(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(storage, "get_content_delivery_type", lambda: "filesystem")
    _write("content/users/user_a/avatars/me.png")
    for bad in ("", None, "..", "../orgs", "user_a/../..", "a b"):
        assert files.remove_user_files(bad) is False
    assert Path("content/users/user_a/avatars/me.png").exists()


def test_storage_error_is_reported_not_raised(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(storage, "get_content_delivery_type", lambda: "s3api")
    monkeypatch.setattr(storage, "get_storage_client", lambda: FakeS3([], broken=True))
    monkeypatch.setattr(storage, "get_s3_bucket_name", lambda: "bucket")
    assert files.remove_user_files("user_a") is False


def test_superadmin_delete_removes_the_files(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(storage, "get_content_delivery_type", lambda: "filesystem")
    monkeypatch.setattr(superadmin_users, "_invalidate_session_cache", lambda _user_id: None)
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine, tables=[User.__table__, Organization.__table__, UserOrganization.__table__])
    with Session(engine) as db:
        admin = User(id=1, username="admin", first_name="A", last_name="A", email="a@example.com", password="x", user_uuid="user_admin", is_superadmin=True)
        target = User(id=2, username="t", first_name="T", last_name="T", email="t@example.com", password="x", user_uuid="user_target")
        db.add(admin)
        db.add(target)
        db.commit()
        _write("content/users/user_target/media/essay.pdf")
        _write("content/users/user_admin/media/keep.pdf")
        superadmin_users.delete_global_user(db, PublicUser.model_validate(admin, from_attributes=True), 2)
        assert db.exec(select(User).where(User.id == 2)).first() is None
    assert not Path("content/users/user_target").exists()
    assert Path("content/users/user_admin/media/keep.pdf").exists()
