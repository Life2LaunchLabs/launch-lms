"""Checkpoint only referenced stored files; session-owned prefixes are disposable."""

import re
from base64 import b64decode, b64encode
from pathlib import PurePosixPath

from fastapi import HTTPException
from src.services.utils.storage import read_file_content, walk_directory

MAX_ASSET_BYTES = 100 * 1024 * 1024
UUID = re.compile(r"(?:org|user)_[A-Za-z0-9_-]+")


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)


def capture_files(
    data: dict, source_user_id: int, cohort_ids: set[int] | None = None
) -> dict:
    # A filename match alone is never enough: require the record's owner/entity path.
    from urllib.parse import urlsplit, unquote

    paths = set()
    for value in strings(data):
        candidates = [urlsplit(value).path]
        candidates.extend(re.findall(r'/(?:api/v1/)?content/[^\s"<>?#]+', value))
        for candidate in candidates:
            path = unquote(candidate).replace("/api/v1/content/", "/content/", 1)
            if path.startswith(("/content/", "content/")):
                paths.add(path.lstrip("/"))
    orgs = {record["id"]: record["org_uuid"] for record in data.get("organization", [])}
    users = [
        record
        for record in data["user"]
        if record["id"] in (cohort_ids or {source_user_id})
    ]
    for name, records in data.items():
        for record in records:
            if name == "user" and record["id"] not in (cohort_ids or {source_user_id}):
                continue
            if name == "organization":
                prefix = f"content/orgs/{record['org_uuid']}"
            elif name == "user":
                prefix = f"content/users/{record['user_uuid']}"
            else:
                org_uuid = orgs.get(record.get("org_id"))
                entity = next(
                    (
                        value
                        for key, value in record.items()
                        if key.endswith("_uuid") and isinstance(value, str)
                    ),
                    None,
                )
                if not org_uuid or not entity:
                    continue
                # Match this entity UUID in the path, preventing unrelated learner file copies.
                prefix = f"content/orgs/{org_uuid}"
            references = set(strings(record))
            filenames = {
                PurePosixPath(value).name
                for value in references
                if "." in value and "/" not in value
            }
            if not filenames and name != "board":
                continue
            for directory, _, files in walk_directory(prefix):
                parts = PurePosixPath(directory).parts
                if name not in {"organization", "user"} and entity not in parts:
                    continue
                # For org and user branding, only their direct feature directories.
                if name in {"organization", "user"} and len(parts) != 4:
                    continue
                for filename in files:
                    # Board uploads can exist only in binary Yjs attributes.
                    if filename in filenames or name == "board":
                        paths.add(f"{directory}/{filename}")
    result = {}
    total = 0
    allowed = {f"content/orgs/{uuid}/" for uuid in orgs.values()} | {
        f"content/users/{user['user_uuid']}/" for user in users
    }
    for path in sorted(paths):
        if ".." in PurePosixPath(path).parts or not any(
            path.startswith(prefix) for prefix in allowed
        ):
            raise HTTPException(
                422, "A checkpoint file is outside the demo user's allowed content."
            )
        content = read_file_content(path)
        if content is None:
            raise HTTPException(
                422,
                "A referenced checkpoint file is missing. Restore the file before publishing.",
            )
        total += len(content)
        if total > MAX_ASSET_BYTES:
            raise HTTPException(
                422, "Checkpoint files exceed the 100 MiB publication limit."
            )
        result[path] = b64encode(content).decode()
    return result


def write_files(files: dict, uuid_map: dict) -> list[str]:
    from src.services.utils.storage import is_s3_enabled, upload_to_s3
    from pathlib import Path

    written = []
    for path, encoded in files.items():
        for old, new in uuid_map.items():
            path = path.replace(old, new)
        # At least the owner must have been remapped before any file write.
        if not re.match(r"^content/(orgs/org|users/user)_demo_[0-9a-f]{32}_", path):
            raise ValueError("Checkpoint media owner was not isolated")
        content = b64decode(encoded)
        if is_s3_enabled():
            if not upload_to_s3(path, content):
                raise RuntimeError("Demo media upload failed")
        else:
            destination = Path(path)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
        written.append(path)
    return written


def clean_files(session_id: str) -> None:
    from src.services.utils.storage import delete_storage_directory, list_directory

    for owner in ("orgs", "users"):
        for directory in list_directory(f"content/{owner}"):
            # list_directory's S3 implementation only returns direct files. Discover S3
            # prefixes separately; the filesystem implementation returns directories.
            if re.fullmatch(
                rf"(?:org|user)_demo_{session_id}_[0-9a-f]{{32}}", directory
            ):
                if not delete_storage_directory(f"content/{owner}/{directory}"):
                    raise RuntimeError("Demo media cleanup failed")
    from src.services.utils.storage import get_storage_client, get_s3_bucket_name

    client = get_storage_client()
    if client:
        for owner in ("orgs", "users"):
            prefix = f"content/{owner}/{'org' if owner == 'orgs' else 'user'}_demo_{session_id}_"
            for page in client.get_paginator("list_objects_v2").paginate(
                Bucket=get_s3_bucket_name(), Prefix=prefix
            ):
                objects = page.get("Contents", [])
                if objects:
                    result = client.delete_objects(
                        Bucket=get_s3_bucket_name(),
                        Delete={"Objects": [{"Key": item["Key"]} for item in objects]},
                    )
                    if result.get("Errors"):
                        raise RuntimeError("Demo media cleanup failed")
