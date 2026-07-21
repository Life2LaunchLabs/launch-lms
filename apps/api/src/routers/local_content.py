"""
Local Content Files Router

Serves static content files from the local filesystem with access control.
Replaces the unauthenticated StaticFiles mount to enforce authorization
on private podcast content while allowing generic content through.

SECURITY:
- Org-level content (logos, branding) is always public
- Podcast episode content for non-public podcasts requires auth
"""

import os
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.podcasts.podcasts import Podcast
from src.db.users import AnonymousUser, PublicUser, APITokenUser
from src.db.user_organizations import UserOrganization
from src.security.auth import get_current_user

router = APIRouter()

CONTENT_DIR = Path("content")


def _validate_content_path(file_path: str) -> Path | None:
    """Validate path is safe and return the resolved path, or None if unsafe."""
    # Decode URL-encoded characters (double-decode for double-encoding attacks)
    decoded = unquote(unquote(file_path))
    if '..' in decoded or decoded.startswith('/') or '\x00' in decoded:
        return None
    normalized = decoded.replace('\\', '/')
    if '..' in normalized:
        return None

    # Canonicalize via os.path.realpath (resolves symlinks, normalizes) and verify containment.
    # realpath is used deliberately: it is a recognized path-injection sanitizer.
    try:
        base_real = os.path.realpath(str(CONTENT_DIR))
        full_real = os.path.realpath(os.path.join(base_real, normalized))
    except (OSError, ValueError):
        return None

    if not full_real.startswith(base_real + os.sep) and full_real != base_real:
        return None

    return Path(full_real)


async def _check_content_access(
    request: Request | str | None,
    file_path: str | PublicUser | AnonymousUser | APITokenUser,
    current_user: PublicUser | AnonymousUser | APITokenUser | Session,
    db_session: Session | None = None,
) -> None:
    """
    Check if the user has access to the requested content.

    Path patterns:
    - orgs/{uuid}/podcasts/{uuid}/episodes/{uuid}/...  → check podcast access
    - orgs/{uuid}/...                                  → org-level (public)
    """
    if db_session is None:
        db_session = current_user  # type: ignore[assignment]
        current_user = file_path  # type: ignore[assignment]
        file_path = request  # type: ignore[assignment]
        request = None

    if not isinstance(file_path, str):
        raise HTTPException(status_code=400, detail="Invalid content path")

    parts = file_path.split('/')

    # Podcast episode content: requires podcast to be public or user to be org member
    if (
        len(parts) >= 6
        and parts[0] == 'orgs'
        and parts[2] == 'podcasts'
        and parts[4] == 'episodes'
    ):
        podcast_uuid = parts[3]
        podcast = db_session.exec(
            select(Podcast).where(Podcast.podcast_uuid == podcast_uuid)
        ).first()
        if not podcast:
            raise HTTPException(status_code=403, detail="Access denied")
        if podcast.public:
            return  # Public podcast — allow anonymous
        if isinstance(current_user, AnonymousUser):
            raise HTTPException(status_code=401, detail="Authentication required")
        # Verify API token is scoped to the correct org
        if isinstance(current_user, APITokenUser):
            if current_user.org_id != podcast.org_id:
                raise HTTPException(status_code=403, detail="Access denied")
            return
        # Verify user belongs to the org that owns this podcast
        membership = db_session.exec(
            select(UserOrganization).where(
                UserOrganization.user_id == current_user.id,
                UserOrganization.org_id == podcast.org_id,
            )
        ).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Access denied")
        return

    # Generic organization content is public.
    if len(parts) >= 2 and parts[0] == 'orgs':
        return

    # User content (avatars, profile images) — always public
    # Paths: users/{user_uuid}/avatars/...
    if len(parts) >= 2 and parts[0] == 'users':
        return

    # Unknown path pattern — require auth as a safe default
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")


# MIME type mapping
_MIME_TYPES = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.txt': 'text/plain',
}


@router.get("/content/{file_path:path}")
async def serve_local_content(
    request: Request,
    file_path: str,
    current_user: PublicUser | AnonymousUser | APITokenUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """
    Serve content files from local filesystem with access control.

    SECURITY: Validates user access based on resource ownership.
    Public podcasts are accessible to anonymous users.
    Private content requires authentication.
    """
    resolved = _validate_content_path(file_path)
    if resolved is None:
        raise HTTPException(status_code=400, detail="Invalid path")

    await _check_content_access(request, file_path, current_user, db_session)

    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    ext = resolved.suffix.lower()
    media_type = _MIME_TYPES.get(ext, 'application/octet-stream')

    db_session.close()
    return FileResponse(
        path=str(resolved),
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.head("/content/{file_path:path}")
async def head_local_content(
    request: Request,
    file_path: str,
    current_user: PublicUser | AnonymousUser | APITokenUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """HEAD request for content files — returns metadata without body."""
    resolved = _validate_content_path(file_path)
    if resolved is None:
        raise HTTPException(status_code=400, detail="Invalid path")

    await _check_content_access(request, file_path, current_user, db_session)

    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    ext = resolved.suffix.lower()
    media_type = _MIME_TYPES.get(ext, 'application/octet-stream')
    file_size = resolved.stat().st_size

    from fastapi.responses import Response
    return Response(
        status_code=200,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": media_type,
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
        },
    )
