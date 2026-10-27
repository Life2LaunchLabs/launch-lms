#!/usr/bin/env python3
"""Copy files stored on the local filesystem (content/) into the configured S3-compatible bucket.

Run once when switching LAUNCHLMS_CONTENT_DELIVERY_TYPE to s3api, from the API directory so
content/ resolves: files already in the bucket are skipped, so it is safe to run again.
"""

import argparse
import json
import os
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from src.services.utils.storage import file_exists, is_s3_enabled, upload_to_s3  # noqa: E402


def sync(root: str = "content", dry_run: bool = False) -> dict:
    copied, skipped, failed = 0, 0, []
    for directory, _, files in os.walk(root):
        for name in files:
            path = os.path.join(directory, name).replace(os.sep, "/")
            if name == ".healthcheck" or file_exists(path):
                skipped += 1
                continue
            if dry_run:
                copied += 1
                continue
            with open(path, "rb") as f:
                if upload_to_s3(path, f.read()):
                    copied += 1
                else:
                    failed.append(path)
    return {"copied": copied, "skipped": skipped, "failed": failed, "dry_run": dry_run}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Count what would be copied without uploading")
    args = parser.parse_args()
    if not is_s3_enabled():
        sys.exit("Set LAUNCHLMS_CONTENT_DELIVERY_TYPE=s3api (and the bucket settings) first.")
    result = sync(dry_run=args.dry_run)
    print(json.dumps({**result, "failed": result["failed"][:50]}, indent=2))
    if result["failed"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
