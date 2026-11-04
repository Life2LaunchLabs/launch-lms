"""Download my data: the signed-in person's own export (services/users/data_export.py)."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import AnonymousUser, PublicUser
from src.security.auth import get_current_user
from src.services.security.rate_limiting import check_rate_limit
from src.services.users.data_export import build_zip

router = APIRouter()


@router.get("/me/data-export")
async def api_download_my_data(
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
):
    """A zip of everything the platform keeps about you, in JSON, with your uploaded files."""
    if isinstance(current_user, AnonymousUser) or not getattr(current_user, "id", None):
        raise HTTPException(status_code=401, detail="Sign in to download your data")
    try:
        allowed, _, retry_after = check_rate_limit(f"data_export:{current_user.id}", max_attempts=5, window_seconds=60 * 60)
    except Exception:  # no Redis (tests, a local run) never blocks the download
        allowed, retry_after = True, 0
    if not allowed:
        raise HTTPException(status_code=429, detail="You've downloaded your data a few times this hour. Try again later.",
                            headers={"Retry-After": str(retry_after)})
    name, body = build_zip(db_session, current_user)

    def chunks():
        try:
            while chunk := body.read(1024 * 1024):
                yield chunk
        finally:
            body.close()

    return StreamingResponse(chunks(), media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="{name}"',
        "Cache-Control": "no-store",
    })
