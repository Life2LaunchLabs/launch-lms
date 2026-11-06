"""A person's language: the one the platform's own text is shown in, on every device.

Saved under user.details so it follows the account; the web app falls back to the browser's
language when none is saved. Server-written text (emails, PDFs) can read it with `user_language`.
"""

from fastapi import HTTPException
from sqlmodel import Session

from src.db.users import PublicUser, User

DETAILS_KEY = "language"
DEFAULT_LANGUAGE = "en"
# Languages whose platform text is finished. Keep in step with READY_LANGUAGES in apps/web/lib/languages.ts.
SUPPORTED_LANGUAGES = ("en", "es")


def user_language(user: User | PublicUser | None) -> str:
    saved = ((user.details or {}).get(DETAILS_KEY) if user else None) or DEFAULT_LANGUAGE
    return saved if saved in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


def get_language(db: Session, current_user: PublicUser) -> dict:
    user = db.get(User, current_user.id)
    saved = (user.details or {}).get(DETAILS_KEY) if user else None
    return {"language": saved if saved in SUPPORTED_LANGUAGES else None, "supported": list(SUPPORTED_LANGUAGES)}


def save_language(db: Session, current_user: PublicUser, language: str | None) -> dict:
    """Save the person's language; None clears it, so the browser's language applies again."""
    code = (language or "").strip().lower().split("-")[0] or None
    if code is not None and code not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail={"message": "That language isn't available yet.", "supported": list(SUPPORTED_LANGUAGES)})
    user = db.get(User, current_user.id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    details = dict(user.details or {})
    if code is None:
        details.pop(DETAILS_KEY, None)
    else:
        details[DETAILS_KEY] = code
    user.details = details
    db.add(user)
    db.commit()
    return get_language(db, current_user)
