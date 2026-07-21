"""
Video Streaming Router

This router provides optimized video streaming endpoints with proper HTTP Range
request handling for seamless playback of long video files.

SECURITY: All streaming endpoints validate resource access using the RBAC system.
Anonymous users can only stream content from public+published resources.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Path
from fastapi.responses import StreamingResponse, Response
from sqlmodel import Session, select

from src.db.podcasts.podcasts import Podcast
from src.db.podcasts.episodes import PodcastEpisode
from src.db.users import AnonymousUser, PublicUser, APITokenUser
from src.core.events.database import get_db_session
from src.security.auth import get_current_user
from src.security.rbac.resource_access import ResourceAccessChecker, AccessAction, AccessContext
from src.services.utils.video_streaming import (
    stream_video_file,
    parse_range_header,
    get_file_info,
    validate_video_path,
    CHUNK_SIZE,
)

router = APIRouter()

# Base content directory
CONTENT_DIR = "content"


async def _verify_podcast_episode_access(
    request: Request,
    podcast_uuid: str,
    episode_uuid: str,
    current_user: PublicUser | AnonymousUser | APITokenUser,
    db_session: Session,
) -> None:
    """
    Verify user has read access to the podcast/episode.

    SECURITY: This ensures that:
    - Anonymous users can only access public+published podcasts
    - Authenticated users can access podcasts they have permission to view
    - Episode must belong to the specified podcast
    """
    # Verify episode exists and belongs to the podcast
    episode_stmt = select(PodcastEpisode).where(PodcastEpisode.episode_uuid == episode_uuid)
    episode = db_session.exec(episode_stmt).first()

    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    podcast_stmt = select(Podcast).where(Podcast.id == episode.podcast_id)
    podcast = db_session.exec(podcast_stmt).first()

    if not podcast or podcast.podcast_uuid != podcast_uuid:
        raise HTTPException(status_code=404, detail="Podcast not found or episode doesn't belong to podcast")

    # RBAC check - verify user can read this podcast
    checker = ResourceAccessChecker(request, db_session, current_user)
    decision = await checker.check_access(podcast_uuid, AccessAction.READ, AccessContext.PUBLIC_VIEW)
@router.get("/audio/{org_uuid}/{podcast_uuid}/{episode_uuid}/{filename:path}")
async def stream_podcast_audio(
    request: Request,
    org_uuid: str = Path(..., description="Organization UUID"),
    podcast_uuid: str = Path(..., description="Podcast UUID"),
    episode_uuid: str = Path(..., description="Episode UUID"),
    filename: str = Path(..., description="Audio filename"),
    current_user: PublicUser | AnonymousUser | APITokenUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """
    Stream an audio file for a podcast episode with proper Range request support.

    This endpoint supports:
    - HTTP Range requests for seeking in audio files
    - Efficient chunked streaming
    - Proper Content-Type headers
    - Cache-Control headers for browser caching

    SECURITY: Validates user has read access to the podcast via RBAC.
    """
    # SECURITY: Verify user has access to this podcast/episode
    await _verify_podcast_episode_access(request, podcast_uuid, episode_uuid, current_user, db_session)

    # Construct and validate the file path
    file_path = validate_video_path(
        CONTENT_DIR,
        "orgs",
        org_uuid,
        "podcasts",
        podcast_uuid,
        "episodes",
        episode_uuid,
        "audio",
        filename,
    )

    if not file_path:
        raise HTTPException(status_code=404, detail="Audio not found")

    # Get file info
    file_size, mime_type, exists = get_file_info(file_path)

    if not exists:
        raise HTTPException(status_code=404, detail="Audio not found")

    # Parse Range header if present
    range_header = request.headers.get("range")
    start, end = parse_range_header(range_header, file_size)

    # Calculate content length for this range
    content_length = end - start + 1

    # Common headers for audio streaming
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": mime_type,
        "Cache-Control": "public, max-age=86400",  # Cache for 24 hours
        "X-Content-Type-Options": "nosniff",
    }

    if range_header:
        # Partial content response (206)
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        headers["Content-Length"] = str(content_length)

        db_session.close()
        return StreamingResponse(
            stream_video_file(file_path, start, end, CHUNK_SIZE),
            status_code=206,
            headers=headers,
            media_type=mime_type,
        )
    else:
        # Full content response (200)
        headers["Content-Length"] = str(file_size)

        db_session.close()
        return StreamingResponse(
            stream_video_file(file_path, 0, file_size - 1, CHUNK_SIZE),
            status_code=200,
            headers=headers,
            media_type=mime_type,
        )


@router.head("/audio/{org_uuid}/{podcast_uuid}/{episode_uuid}/{filename:path}")
async def head_podcast_audio(
    request: Request,
    org_uuid: str = Path(..., description="Organization UUID"),
    podcast_uuid: str = Path(..., description="Podcast UUID"),
    episode_uuid: str = Path(..., description="Episode UUID"),
    filename: str = Path(..., description="Audio filename"),
    current_user: PublicUser | AnonymousUser | APITokenUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """
    HEAD request for podcast audio - returns metadata without body.

    This is used by audio players to determine file size and supported ranges
    before starting playback.

    SECURITY: Validates user has read access to the podcast via RBAC.
    """
    # SECURITY: Verify user has access to this podcast/episode
    await _verify_podcast_episode_access(request, podcast_uuid, episode_uuid, current_user, db_session)

    file_path = validate_video_path(
        CONTENT_DIR,
        "orgs",
        org_uuid,
        "podcasts",
        podcast_uuid,
        "episodes",
        episode_uuid,
        "audio",
        filename,
    )

    if not file_path:
        raise HTTPException(status_code=404, detail="Audio not found")

    file_size, mime_type, exists = get_file_info(file_path)

    if not exists:
        raise HTTPException(status_code=404, detail="Audio not found")

    return Response(
        status_code=200,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": mime_type,
            "Cache-Control": "public, max-age=86400",
        },
    )
