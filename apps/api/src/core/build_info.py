"""What this running app is: the image's baked build info, with the release it was deployed as on top.

A pull request builds and tests an image, and the merge deploys that same image as the merged
commit. The deploy passes that commit and version (LAUNCHLMS_RELEASE_*); they win over what the
image baked in, which stays readable as `build_commit_sha`.
"""

import json
import os
import re
from pathlib import Path

BUILD_INFO_PATH = Path("/app/build-info.json")
SHA = re.compile(r"[0-9a-f]{40}")


def released(data: dict, env=os.environ) -> dict:
    commit = env.get("LAUNCHLMS_RELEASE_COMMIT_SHA", "").strip().lower()
    if not SHA.fullmatch(commit) or commit == data.get("commit_sha"):
        return data
    out = {**data, "build_commit_sha": data.get("commit_sha"), "commit_sha": commit}
    for key, name in (("version", "LAUNCHLMS_RELEASE_VERSION"), ("source_branch", "LAUNCHLMS_RELEASE_SOURCE_BRANCH")):
        if value := env.get(name, "").strip():
            out[key] = value
    return out


def build_info() -> dict | None:
    """The build info, or None when this is not a built image (local development)."""
    try:
        data = json.loads(BUILD_INFO_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    return released(data) if isinstance(data, dict) else None
