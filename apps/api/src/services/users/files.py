"""A person's own uploaded files, all kept under content/users/<user_uuid>/ (avatars, their media library,
Discover notes and outcome files, portfolio imports)."""

import logging
import re

from sqlmodel import Session
from src.db.users import User
from src.services.utils.storage import delete_storage_directory

logger = logging.getLogger(__name__)

_SAFE_UUID = re.compile(r"^[A-Za-z0-9_-]+$")


def remove_user_files(user_uuid: str | None) -> bool:
    """Delete everything stored under this person's folder, on the filesystem and in S3. Call it after the
    account's rows are committed: a storage error is logged and never undoes the account deletion."""
    if not user_uuid or not _SAFE_UUID.match(user_uuid):
        logger.error("Not removing files for an unexpected user uuid: %r", user_uuid)
        return False
    try:
        removed = delete_storage_directory(f"content/users/{user_uuid}")
    except Exception:
        logger.exception("Removing files for deleted user %s failed", user_uuid)
        return False
    if not removed:
        logger.error("Some files for deleted user %s were not removed; retry with remove_user_files", user_uuid)
    return removed


def delete_user_and_files(db_session: Session, user: User) -> None:
    """Delete the account row (its other rows cascade), commit, then remove the person's uploaded files."""
    user_uuid = user.user_uuid
    db_session.delete(user)
    db_session.commit()
    remove_user_files(user_uuid)
