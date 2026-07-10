from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.media import MediaAsset, MediaAssetFolderUpdate, MediaFolder, MediaFolderCreate, MediaFolderUpdate, MediaLinkCreate, MediaOwnerType, MediaType
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services import media as media_service


PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Organization.__table__,
            Role.__table__,
            UserOrganization.__table__,
            MediaAsset.__table__,
            MediaFolder.__table__,
        ],
    )
    return Session(engine)


def _user(user_id: int, username: str) -> User:
    return User(
        id=user_id,
        user_uuid=f"user-{user_id}",
        username=username,
        first_name=username,
        last_name="User",
        email=f"{username}@example.com",
        password="secret",
    )


def _public(user: User) -> PublicUser:
    return PublicUser.model_validate(user)


def _org(org_id: int = 1) -> Organization:
    return Organization(
        id=org_id,
        org_uuid=f"org-{org_id}",
        name="Test Org",
        slug=f"test-{org_id}",
        email="org@example.com",
    )


async def _fake_upload_file(**_kwargs):
    return "stored-avatar.png"


@pytest.mark.asyncio
async def test_user_can_upload_list_and_apply_avatar(monkeypatch):
    monkeypatch.setattr(media_service, "upload_file", _fake_upload_file)

    with _session() as db:
        user = _user(1, "maya")
        db.add(user)
        db.commit()

        upload = UploadFile(filename="avatar.png", file=BytesIO(PNG_BYTES))
        asset = await media_service.upload_media_asset(
            MediaOwnerType.user,
            user.id,
            MediaType.image,
            upload,
            _public(user),
            db,
            title="Avatar",
        )

        assets = media_service.list_media_assets(MediaOwnerType.user, user.id, _public(user), db, media_type=MediaType.image)
        updated_user = media_service.apply_media_asset_to_user_avatar(asset.asset_uuid, _public(user), db)

        assert len(assets) == 1
        assert assets[0].filename == "stored-avatar.png"
        assert updated_user.avatar_image == "/content/users/user-1/media/stored-avatar.png"


def test_user_cannot_list_another_users_media():
    with _session() as db:
        owner = _user(1, "owner")
        other = _user(2, "other")
        db.add(owner)
        db.add(other)
        db.commit()

        with pytest.raises(HTTPException) as exc:
            media_service.list_media_assets(MediaOwnerType.user, owner.id, _public(other), db)

        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_org_admin_can_create_org_media_but_member_cannot(monkeypatch):
    monkeypatch.setattr(media_service, "upload_file", _fake_upload_file)

    with _session() as db:
        admin = _user(1, "admin")
        member = _user(2, "member")
        org = _org()
        db.add(admin)
        db.add(member)
        db.add(org)
        db.add(UserOrganization(user_id=admin.id, org_id=org.id, role_id=1, creation_date="", update_date=""))
        db.add(UserOrganization(user_id=member.id, org_id=org.id, role_id=3, creation_date="", update_date=""))
        db.commit()

        upload = UploadFile(filename="banner.png", file=BytesIO(PNG_BYTES))
        asset = await media_service.upload_media_asset(
            MediaOwnerType.org,
            org.id,
            MediaType.image,
            upload,
            _public(admin),
            db,
        )
        listed = media_service.list_media_assets(MediaOwnerType.org, org.id, _public(member), db)

        assert asset.owner_org_id == org.id
        assert len(listed) == 1

        upload = UploadFile(filename="blocked.png", file=BytesIO(PNG_BYTES))
        with pytest.raises(HTTPException) as exc:
            await media_service.upload_media_asset(MediaOwnerType.org, org.id, MediaType.image, upload, _public(member), db)

        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_link_creation_accepts_direct_image_and_youtube(monkeypatch):
    async def fake_verified_direct_media(url, media_type):
        assert media_type == MediaType.image
        return "image/png", 123

    monkeypatch.setattr(media_service, "_verified_direct_media", fake_verified_direct_media)

    with _session() as db:
        user = _user(1, "maya")
        db.add(user)
        db.commit()

        image_asset = await media_service.create_link_media_asset(
            MediaLinkCreate(
                owner_type=MediaOwnerType.user,
                owner_id=user.id,
                media_type=MediaType.image,
                url="https://example.com/image.png",
            ),
            _public(user),
            db,
        )
        video_asset = await media_service.create_link_media_asset(
            MediaLinkCreate(
                owner_type=MediaOwnerType.user,
                owner_id=user.id,
                media_type=MediaType.video,
                url="https://www.youtube.com/watch?v=abc12345678",
            ),
            _public(user),
            db,
        )

        saved = db.exec(select(MediaAsset)).all()
        assert image_asset.mime_type == "image/png"
        assert video_asset.thumbnail_url == "https://img.youtube.com/vi/abc12345678/mqdefault.jpg"
        assert len(saved) == 2


@pytest.mark.asyncio
async def test_direct_media_rejects_blocked_internal_urls():
    with pytest.raises(HTTPException) as exc:
        await media_service._verified_direct_media("http://127.0.0.1/avatar.png", MediaType.image)

    assert exc.value.status_code == 400


def test_folder_create_rename_and_delete_moves_assets_to_default_folder():
    with _session() as db:
        user = _user(1, "maya")
        db.add(user)
        db.commit()
        current_user = _public(user)

        folder = media_service.create_media_folder(
            MediaFolderCreate(owner_type=MediaOwnerType.user, owner_id=user.id, name="Portraits"),
            current_user,
            db,
        )
        upload_asset = MediaAsset(
            asset_uuid="asset-1",
            owner_type=MediaOwnerType.user,
            owner_user_id=user.id,
            created_by_user_id=user.id,
            source_type="upload",
            media_type=MediaType.image,
            title="Headshot",
            url="https://example.com/headshot.png",
            thumbnail_url="https://example.com/headshot.png",
            folder="Portraits",
            creation_date="2026-01-01",
            update_date="2026-01-01",
        )
        link_asset = MediaAsset(
            asset_uuid="asset-link-1",
            owner_type=MediaOwnerType.user,
            owner_user_id=user.id,
            created_by_user_id=user.id,
            source_type="link",
            media_type=MediaType.image,
            title="Linked Headshot",
            url="https://example.com/linked-headshot.png",
            thumbnail_url="https://example.com/linked-headshot.png",
            folder="Portraits",
            creation_date="2026-01-01",
            update_date="2026-01-01",
        )
        db.add(upload_asset)
        db.add(link_asset)
        db.commit()

        updated = media_service.update_media_folder(
            folder.folder_uuid,
            MediaFolderUpdate(name="Profile Pics"),
            current_user,
            db,
        )
        renamed_asset = db.exec(select(MediaAsset).where(MediaAsset.asset_uuid == "asset-1")).first()

        assert updated.name == "Profile Pics"
        assert renamed_asset.folder == "Profile Pics"

        result = media_service.delete_media_folder(updated.folder_uuid, current_user, db)
        moved_asset = db.exec(select(MediaAsset).where(MediaAsset.asset_uuid == "asset-1")).first()
        moved_link_asset = db.exec(select(MediaAsset).where(MediaAsset.asset_uuid == "asset-link-1")).first()

        assert result == {"success": True}
        assert moved_asset.folder == "Uploads"
        assert moved_link_asset.folder == "Links"


def test_asset_can_move_into_folder_and_back_to_uploads():
    with _session() as db:
        user = _user(1, "maya")
        db.add(user)
        db.commit()
        current_user = _public(user)
        folder = media_service.create_media_folder(
            MediaFolderCreate(owner_type=MediaOwnerType.user, owner_id=user.id, name="Favorites"),
            current_user,
            db,
        )
        asset = MediaAsset(
            asset_uuid="asset-2",
            owner_type=MediaOwnerType.user,
            owner_user_id=user.id,
            created_by_user_id=user.id,
            source_type="upload",
            media_type=MediaType.image,
            title="Headshot",
            url="https://example.com/headshot.png",
            thumbnail_url="https://example.com/headshot.png",
            folder="Uploads",
            creation_date="2026-01-01",
            update_date="2026-01-01",
        )
        db.add(asset)
        db.commit()

        moved = media_service.update_media_asset_folder(
            asset.asset_uuid,
            MediaAssetFolderUpdate(folder=folder.name),
            current_user,
            db,
        )
        assert moved.folder == "Favorites"

        removed = media_service.update_media_asset_folder(
            asset.asset_uuid,
            MediaAssetFolderUpdate(folder=None),
            current_user,
            db,
        )

        assert removed.folder == "Uploads"
