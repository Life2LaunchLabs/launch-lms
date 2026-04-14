from fastapi import UploadFile
from src.services.utils.upload_content import upload_file


async def upload_collection_thumbnail(
    thumbnail_file: UploadFile,
    org_uuid: str,
    collection_uuid: str,
) -> str:
    """Upload a thumbnail image for a collection with file validation."""
    return await upload_file(
        file=thumbnail_file,
        directory=f"collections/{collection_uuid}/thumbnails",
        type_of_dir="orgs",
        uuid=org_uuid,
        allowed_types=["image"],
        filename_prefix="thumbnail",
    )
