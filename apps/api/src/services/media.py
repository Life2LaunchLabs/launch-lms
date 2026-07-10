import re
from datetime import datetime
from urllib.parse import parse_qs, urljoin, urlparse
from uuid import uuid4

import httpx
from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session, select

from src.db.media import (
    MediaAsset,
    MediaAssetFolderUpdate,
    MediaFolder,
    MediaFolderCreate,
    MediaFolderUpdate,
    MediaLinkCreate,
    MediaOwnerType,
    MediaSourceType,
    MediaType,
)
from src.db.organizations import Organization
from src.db.users import AnonymousUser, PublicUser, User
from src.security.org_auth import require_org_admin, require_org_membership
from src.security.file_validation import validate_upload
from src.services.utils.link_preview import _validate_url, fetch_link_preview
from src.services.utils.upload_content import upload_file


_REQUEST_HEADERS = {
    "User-Agent": "LaunchLMS Media Library/1.0",
    "Accept": "*/*",
}


def _now() -> str:
    return str(datetime.now())


def _asset_title(title: str | None, fallback: str) -> str:
    clean_title = (title or "").strip()
    return clean_title or fallback


def _media_url(owner_type: MediaOwnerType, owner_uuid: str, filename: str) -> str:
    return f"/content/{owner_type.value}s/{owner_uuid}/media/{filename}"


def _upload_owner_type(owner_type: MediaOwnerType) -> str:
    return "users" if owner_type == MediaOwnerType.user else "orgs"


def _default_folder_for_asset(asset: MediaAsset) -> str:
    return "Links" if asset.source_type in (MediaSourceType.link, MediaSourceType.link.value) else "Uploads"


def _get_owner_uuid(owner_type: MediaOwnerType, owner_id: int, current_user: PublicUser, db_session: Session) -> str:
    if owner_type == MediaOwnerType.user:
        if owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only manage your own media")
        user = db_session.exec(select(User).where(User.id == owner_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user.user_uuid

    org = db_session.exec(select(Organization).where(Organization.id == owner_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org.org_uuid


def _authorize_read(owner_type: MediaOwnerType, owner_id: int, current_user: PublicUser, db_session: Session) -> None:
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if owner_type == MediaOwnerType.user:
        if owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your own media")
        return
    require_org_membership(current_user.id, owner_id, db_session)


def _authorize_mutation(owner_type: MediaOwnerType, owner_id: int, current_user: PublicUser, db_session: Session) -> None:
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if owner_type == MediaOwnerType.user:
        if owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only manage your own media")
        return
    require_org_admin(current_user.id, owner_id, db_session)


def list_media_assets(
    owner_type: MediaOwnerType,
    owner_id: int,
    current_user: PublicUser,
    db_session: Session,
    media_type: MediaType | None = None,
    folder: str | None = None,
) -> list[MediaAsset]:
    _authorize_read(owner_type, owner_id, current_user, db_session)

    statement = select(MediaAsset).where(MediaAsset.owner_type == owner_type)
    if owner_type == MediaOwnerType.user:
        statement = statement.where(MediaAsset.owner_user_id == owner_id)
    else:
        statement = statement.where(MediaAsset.owner_org_id == owner_id)
    if media_type:
        statement = statement.where(MediaAsset.media_type == media_type)
    if folder:
        statement = statement.where(MediaAsset.folder == folder)
    statement = statement.order_by(MediaAsset.id.desc())
    return list(db_session.exec(statement).all())


def list_media_folders(
    owner_type: MediaOwnerType,
    owner_id: int,
    current_user: PublicUser,
    db_session: Session,
) -> list[MediaFolder]:
    _authorize_read(owner_type, owner_id, current_user, db_session)
    statement = select(MediaFolder).where(MediaFolder.owner_type == owner_type)
    if owner_type == MediaOwnerType.user:
        statement = statement.where(MediaFolder.owner_user_id == owner_id)
    else:
        statement = statement.where(MediaFolder.owner_org_id == owner_id)
    statement = statement.order_by(MediaFolder.name.asc())
    return list(db_session.exec(statement).all())


def create_media_folder(
    payload: MediaFolderCreate,
    current_user: PublicUser,
    db_session: Session,
) -> MediaFolder:
    _authorize_mutation(payload.owner_type, payload.owner_id, current_user, db_session)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")

    existing = list_media_folders(payload.owner_type, payload.owner_id, current_user, db_session)
    if any(folder.name.lower() == name.lower() for folder in existing):
        raise HTTPException(status_code=409, detail="A folder with that name already exists")

    now = _now()
    folder = MediaFolder(
        folder_uuid=str(uuid4()),
        owner_type=payload.owner_type,
        owner_user_id=payload.owner_id if payload.owner_type == MediaOwnerType.user else None,
        owner_org_id=payload.owner_id if payload.owner_type == MediaOwnerType.org else None,
        created_by_user_id=current_user.id,
        name=name,
        creation_date=now,
        update_date=now,
    )
    db_session.add(folder)
    db_session.commit()
    db_session.refresh(folder)
    return folder


def _get_folder_or_404(folder_uuid: str, db_session: Session) -> MediaFolder:
    folder = db_session.exec(select(MediaFolder).where(MediaFolder.folder_uuid == folder_uuid)).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


def update_media_folder(
    folder_uuid: str,
    payload: MediaFolderUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> MediaFolder:
    folder = _get_folder_or_404(folder_uuid, db_session)
    owner_id = folder.owner_user_id if folder.owner_type == MediaOwnerType.user else folder.owner_org_id
    if owner_id is None:
        raise HTTPException(status_code=400, detail="Folder owner is invalid")
    _authorize_mutation(folder.owner_type, owner_id, current_user, db_session)

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")

    existing = list_media_folders(folder.owner_type, owner_id, current_user, db_session)
    if any(other.folder_uuid != folder.folder_uuid and other.name.lower() == name.lower() for other in existing):
        raise HTTPException(status_code=409, detail="A folder with that name already exists")

    old_name = folder.name
    folder.name = name
    folder.update_date = _now()
    assets = list_media_assets(folder.owner_type, owner_id, current_user, db_session, folder=old_name)
    for asset in assets:
        asset.folder = name
        asset.update_date = folder.update_date
        db_session.add(asset)
    db_session.add(folder)
    db_session.commit()
    db_session.refresh(folder)
    return folder


def delete_media_folder(
    folder_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, bool]:
    folder = _get_folder_or_404(folder_uuid, db_session)
    owner_id = folder.owner_user_id if folder.owner_type == MediaOwnerType.user else folder.owner_org_id
    if owner_id is None:
        raise HTTPException(status_code=400, detail="Folder owner is invalid")
    _authorize_mutation(folder.owner_type, owner_id, current_user, db_session)

    now = _now()
    assets = list_media_assets(folder.owner_type, owner_id, current_user, db_session, folder=folder.name)
    for asset in assets:
        asset.folder = _default_folder_for_asset(asset)
        asset.update_date = now
        db_session.add(asset)
    db_session.delete(folder)
    db_session.commit()
    return {"success": True}


def update_media_asset_folder(
    asset_uuid: str,
    payload: MediaAssetFolderUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> MediaAsset:
    asset = db_session.exec(select(MediaAsset).where(MediaAsset.asset_uuid == asset_uuid)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")

    owner_id = asset.owner_user_id if asset.owner_type == MediaOwnerType.user else asset.owner_org_id
    if owner_id is None:
        raise HTTPException(status_code=400, detail="Media asset owner is invalid")
    _authorize_mutation(asset.owner_type, owner_id, current_user, db_session)

    folder = payload.folder.strip() if payload.folder else _default_folder_for_asset(asset)
    folder = folder or _default_folder_for_asset(asset)
    if folder != "Uploads" and folder != "Links":
        existing = list_media_folders(asset.owner_type, owner_id, current_user, db_session)
        if not any(item.name == folder for item in existing):
            raise HTTPException(status_code=404, detail="Folder not found")

    asset.folder = folder
    asset.update_date = _now()
    db_session.add(asset)
    db_session.commit()
    db_session.refresh(asset)
    return asset


def _youtube_video_id(url: str) -> str | None:
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    if hostname in {"youtu.be", "www.youtu.be"}:
        video_id = parsed.path.strip("/").split("/")[0]
        return video_id or None
    if hostname.endswith("youtube.com"):
        query_id = parse_qs(parsed.query).get("v", [None])[0]
        if query_id:
            return query_id
        match = re.search(r"/(?:embed|shorts)/([^/?#]+)", parsed.path)
        return match.group(1) if match else None
    return None


def _vimeo_video_id(url: str) -> str | None:
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    if not hostname.endswith("vimeo.com"):
        return None
    match = re.search(r"/(?:video/)?(\d+)", parsed.path)
    return match.group(1) if match else None


async def _verified_direct_media(url: str, media_type: MediaType) -> tuple[str, int | None]:
    validated_url = _validate_url(url)
    async with httpx.AsyncClient(follow_redirects=False, timeout=10, headers=_REQUEST_HEADERS) as client:
        response = await client.head(validated_url)
        redirect_count = 0
        while response.is_redirect and redirect_count < 5:
            redirect_count += 1
            redirect_url = response.headers.get("location")
            if not redirect_url:
                break
            validated_url = _validate_url(urljoin(validated_url, redirect_url))
            response = await client.head(validated_url)
        if response.status_code >= 400 or not response.headers.get("content-type"):
            response = await client.get(validated_url, headers={**_REQUEST_HEADERS, "Range": "bytes=0-0"})
            redirect_count = 0
            while response.is_redirect and redirect_count < 5:
                redirect_count += 1
                redirect_url = response.headers.get("location")
                if not redirect_url:
                    break
                validated_url = _validate_url(urljoin(validated_url, redirect_url))
                response = await client.get(validated_url, headers={**_REQUEST_HEADERS, "Range": "bytes=0-0"})
        if response.status_code >= 400:
            raise HTTPException(status_code=400, detail=f"Media URL returned HTTP {response.status_code}")
        content_type = response.headers.get("content-type", "").split(";")[0].lower()
        expected_prefix = f"{media_type.value}/"
        if not content_type.startswith(expected_prefix):
            raise HTTPException(status_code=400, detail=f"URL is not a {media_type.value} file")
        content_length = response.headers.get("content-length")
        size_bytes = int(content_length) if content_length and content_length.isdigit() else None
        return content_type, size_bytes


async def create_link_media_asset(
    payload: MediaLinkCreate,
    current_user: PublicUser,
    db_session: Session,
) -> MediaAsset:
    _authorize_mutation(payload.owner_type, payload.owner_id, current_user, db_session)

    url = payload.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Only http and https URLs are allowed")

    title = payload.title
    thumbnail_url: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None

    youtube_id = _youtube_video_id(url)
    vimeo_id = _vimeo_video_id(url)
    if youtube_id or vimeo_id:
        if payload.media_type != MediaType.video:
            raise HTTPException(status_code=400, detail="Video links can only be used in video media fields")
        if youtube_id:
            thumbnail_url = f"https://img.youtube.com/vi/{youtube_id}/mqdefault.jpg"
            title = title or f"YouTube video {youtube_id}"
        else:
            title = title or f"Vimeo video {vimeo_id}"
        mime_type = "text/html"
    else:
        try:
            mime_type, size_bytes = await _verified_direct_media(url, payload.media_type)
            title = title or urlparse(url).path.rsplit("/", 1)[-1] or f"Linked {payload.media_type.value}"
            thumbnail_url = url if payload.media_type == MediaType.image else None
        except HTTPException as direct_error:
            if payload.media_type != MediaType.image:
                raise direct_error
            preview = await fetch_link_preview(url)
            preview_image = preview.get("og_image")
            if not preview_image:
                raise direct_error
            mime_type, size_bytes = await _verified_direct_media(preview_image, MediaType.image)
            title = title or preview.get("title") or "Linked image"
            thumbnail_url = preview_image
            url = preview_image

    now = _now()
    asset = MediaAsset(
        asset_uuid=str(uuid4()),
        owner_type=payload.owner_type,
        owner_user_id=payload.owner_id if payload.owner_type == MediaOwnerType.user else None,
        owner_org_id=payload.owner_id if payload.owner_type == MediaOwnerType.org else None,
        created_by_user_id=current_user.id,
        source_type=MediaSourceType.link,
        media_type=payload.media_type,
        title=_asset_title(title, "Linked media"),
        url=url,
        thumbnail_url=thumbnail_url or url,
        filename=None,
        mime_type=mime_type,
        size_bytes=size_bytes,
        folder=payload.folder or "Links",
        creation_date=now,
        update_date=now,
    )
    db_session.add(asset)
    db_session.commit()
    db_session.refresh(asset)
    return asset


async def upload_media_asset(
    owner_type: MediaOwnerType,
    owner_id: int,
    media_type: MediaType,
    media_file: UploadFile,
    current_user: PublicUser,
    db_session: Session,
    title: str | None = None,
    folder: str | None = None,
) -> MediaAsset:
    _authorize_mutation(owner_type, owner_id, current_user, db_session)
    owner_uuid = _get_owner_uuid(owner_type, owner_id, current_user, db_session)
    mime_type, content = validate_upload(media_file, [media_type.value])
    filename = await upload_file(
        file=media_file,
        directory="media",
        type_of_dir=_upload_owner_type(owner_type),  # type: ignore[arg-type]
        uuid=owner_uuid,
        allowed_types=[media_type.value],
        filename_prefix="media",
    )
    url = _media_url(owner_type, owner_uuid, filename)
    now = _now()
    asset = MediaAsset(
        asset_uuid=str(uuid4()),
        owner_type=owner_type,
        owner_user_id=owner_id if owner_type == MediaOwnerType.user else None,
        owner_org_id=owner_id if owner_type == MediaOwnerType.org else None,
        created_by_user_id=current_user.id,
        source_type=MediaSourceType.upload,
        media_type=media_type,
        title=_asset_title(title, media_file.filename or filename),
        url=url,
        thumbnail_url=url if media_type == MediaType.image else None,
        filename=filename,
        mime_type=mime_type,
        size_bytes=len(content),
        folder=folder or "Uploads",
        creation_date=now,
        update_date=now,
    )
    db_session.add(asset)
    db_session.commit()
    db_session.refresh(asset)
    return asset


def apply_media_asset_to_user_avatar(
    asset_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> User:
    asset = db_session.exec(select(MediaAsset).where(MediaAsset.asset_uuid == asset_uuid)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    if asset.media_type != MediaType.image:
        raise HTTPException(status_code=400, detail="Only image assets can be used as an avatar")
    if asset.owner_type != MediaOwnerType.user or asset.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only use your own media")

    user = db_session.exec(select(User).where(User.id == current_user.id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.avatar_image = asset.url
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user
