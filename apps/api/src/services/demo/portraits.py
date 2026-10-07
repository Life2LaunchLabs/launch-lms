"""Publish only the designated pilot's captured raster avatar, never a live lookup."""

from base64 import b64decode


def published_portrait(user, files: dict) -> str | None:
    if not user.avatar_image:
        return None
    for path, encoded in files.items():
        if (
            path.startswith(f"content/users/{user.user_uuid}/")
            and path.rsplit("/", 1)[-1] == user.avatar_image.rsplit("/", 1)[-1]
        ):
            content = b64decode(encoded)
            mime = None
            if content.startswith(b"\x89PNG\r\n\x1a\n"):
                mime = "image/png"
            elif content.startswith(b"\xff\xd8\xff"):
                mime = "image/jpeg"
            elif content.startswith((b"GIF87a", b"GIF89a")):
                mime = "image/gif"
            elif content.startswith(b"RIFF") and content[8:12] == b"WEBP":
                mime = "image/webp"
            if mime:
                return f"data:{mime};base64,{encoded}"
    return None
