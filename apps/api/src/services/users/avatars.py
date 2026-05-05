from fastapi import UploadFile
from src.services.utils.upload_content import upload_file


async def upload_avatar(avatar_file: UploadFile, user_uuid: str) -> str:
    """Upload user avatar."""
    return await upload_file(
        file=avatar_file,
        directory="avatars",
        type_of_dir="users",
        uuid=user_uuid,
        allowed_types=["image"],
        filename_prefix="avatar"
    )


async def upload_profile_cover(cover_file: UploadFile, user_uuid: str) -> str:
    """Upload user profile cover image."""
    return await upload_file(
        file=cover_file,
        directory="profile_covers",
        type_of_dir="users",
        uuid=user_uuid,
        allowed_types=["image"],
        filename_prefix="profile_cover"
    )


async def upload_profile_featured_image(image_file: UploadFile, user_uuid: str) -> str:
    """Upload user profile featured card image."""
    return await upload_file(
        file=image_file,
        directory="profile_featured",
        type_of_dir="users",
        uuid=user_uuid,
        allowed_types=["image"],
        filename_prefix="profile_featured"
    )
