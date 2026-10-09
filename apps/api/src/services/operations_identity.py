"""Stable opaque subjects shared by embed sessions and feedback migration."""

from __future__ import annotations

import hashlib
import hmac


def opaque_subject(kind: str, value: str, secret: str) -> str:
    if kind not in {"user", "organization", "deleted-feedback-user"} or not value or len(secret) < 32:
        raise ValueError("Operations subject signing is not configured")
    return hmac.new(secret.encode(), f"{kind}:{value}".encode(), hashlib.sha256).hexdigest()
