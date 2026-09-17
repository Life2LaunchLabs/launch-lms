#!/usr/bin/env python3
"""Audit legacy FEED ownership; write opaque platform properties only with approval.

This command runs in the application API environment while the old Jira credential
and operations subject secret are still available. It never changes app records or
the legacy Jira property. A repeat run safely skips matching platform properties.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys

from sqlalchemy import create_engine
from sqlmodel import Session, select

API = Path(__file__).resolve().parents[1]
if str(API) not in sys.path:
    sys.path.insert(0, str(API))

from src.db.organizations import Organization  # noqa: E402
from src.db.users import User  # noqa: E402
from src.services.candidate_jira import CandidateJira, FEEDBACK_PROPERTY  # noqa: E402
from src.services.operations_identity import opaque_subject  # noqa: E402


PLATFORM_PROPERTY = "launch-operations"
PROJECT_KEY = re.compile(r"^[A-Z][A-Z0-9_]{1,31}$")
ISSUE_KEY = re.compile(r"^[A-Z][A-Z0-9_]{1,31}-[1-9][0-9]*$")
DIGEST = re.compile(r"^[0-9a-f]{64}$")


def feedback_issues(client: CandidateJira) -> list[dict]:
    if not PROJECT_KEY.fullmatch(client.project):
        raise ValueError("Invalid FEED project key")
    issues: list[dict] = []
    token = None
    seen = set()
    while True:
        payload = {
            "jql": f'project = "{client.project}" AND labels = "launchlms-feedback" ORDER BY key ASC',
            "fields": ["labels"], "maxResults": 100,
        }
        if token:
            payload["nextPageToken"] = token
        page = client._request("POST", "/rest/api/3/search/jql", payload)
        issues.extend(page.get("issues", []))
        next_token = page.get("nextPageToken")
        if page.get("isLast") is True or not next_token:
            break
        if next_token in seen:
            raise ValueError("Jira search pagination repeated a token")
        seen.add(next_token)
        token = next_token
    keys = [issue.get("key") for issue in issues]
    if len(keys) != len(set(keys)) or any(
        not isinstance(key, str) or not ISSUE_KEY.fullmatch(key) or
        not key.startswith(client.project + "-") for key in keys
    ):
        raise ValueError("Jira search returned duplicate or invalid issue keys")
    return issues


def migration_plan(client: CandidateJira, session: Session, secret: str) -> tuple[list[tuple[str, dict]], int, str]:
    if len(secret) < 32:
        raise ValueError("Operations subject secret is missing")
    plan = []
    already_migrated = 0
    for issue in feedback_issues(client):
        key = issue["key"]
        legacy = client.property(key, FEEDBACK_PROPERTY)
        if not isinstance(legacy, dict):
            raise ValueError(f"{key}: legacy ownership property is missing")
        if legacy.get("source") != "unstable":
            raise ValueError(f"{key}: legacy feedback source is not unstable")
        user_id, org_id = legacy.get("user_id"), legacy.get("org_id")
        if type(user_id) is not int or type(org_id) is not int:
            raise ValueError(f"{key}: legacy owner IDs are invalid")
        labels = set(issue.get("fields", {}).get("labels") or [])
        if "launchlms-feedback" not in labels or f"launchlms-org-{org_id}" not in labels:
            raise ValueError(f"{key}: Jira labels disagree with legacy organization ownership")
        user = session.exec(select(User).where(User.id == user_id)).first()
        org = session.exec(select(Organization).where(Organization.id == org_id)).first()
        if not user or not org or not user.user_uuid or not org.org_uuid:
            raise ValueError(f"{key}: app owner or durable UUID is missing")
        if legacy.get("user_uuid") != user.user_uuid:
            raise ValueError(f"{key}: legacy user UUID does not match the app database")
        desired = {
            "project": "launch-lms", "environment": "unstable",
            "opaque_user_id": opaque_subject("user", user.user_uuid, secret),
            "opaque_organization_id": opaque_subject("organization", org.org_uuid, secret),
            "intent": legacy.get("intent"), "synchronization_revision": 1,
        }
        existing = client.property(key, PLATFORM_PROPERTY)
        if existing is not None:
            if not isinstance(existing, dict) or any(existing.get(field) != desired[field] for field in (
                "project", "environment", "opaque_user_id", "opaque_organization_id",
            )):
                raise ValueError(f"{key}: existing platform ownership conflicts")
            already_migrated += 1
        plan.append((key, desired))
    material = [[key, value["opaque_user_id"], value["opaque_organization_id"]] for key, value in plan]
    digest = hashlib.sha256(json.dumps(material, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return plan, already_migrated, digest


def apply_plan(client: CandidateJira, plan: list[tuple[str, dict]]) -> int:
    changed = 0
    for key, value in plan:
        existing = client.property(key, PLATFORM_PROPERTY)
        if existing is not None:
            if not isinstance(existing, dict) or any(existing.get(field) != value[field] for field in (
                "project", "environment", "opaque_user_id", "opaque_organization_id",
            )):
                raise ValueError(f"{key}: platform ownership changed after audit")
            continue
        client.set_property(key, PLATFORM_PROPERTY, value)
        if client.property(key, PLATFORM_PROPERTY) != value:
            raise ValueError(f"{key}: Jira did not return the expected platform property")
        changed += 1
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write audited Jira properties")
    parser.add_argument("--expected-count", type=int)
    parser.add_argument("--expected-digest")
    arguments = parser.parse_args()
    if arguments.apply and (not arguments.expected_count or not arguments.expected_digest or
                            not DIGEST.fullmatch(arguments.expected_digest)):
        parser.error("--apply requires a positive --expected-count and 64-character --expected-digest")
    database_url = os.getenv("LAUNCHLMS_SQL_CONNECTION_STRING") or os.getenv("DATABASE_URL")
    if not database_url:
        parser.error("LAUNCHLMS_SQL_CONNECTION_STRING or DATABASE_URL is required")
    client = CandidateJira()
    if not client.configured or client.project != "FEED":
        parser.error("The FEED Jira connection must be configured")
    secret = os.getenv("LAUNCHLMS_OPERATIONS_SUBJECT_SECRET", "")
    try:
        engine = create_engine(database_url, pool_pre_ping=True)
        with Session(engine) as session:
            plan, existing, digest = migration_plan(client, session, secret)
        print(json.dumps({"issues": len(plan), "already_migrated": existing, "digest": digest,
                          "mode": "apply" if arguments.apply else "audit"}, sort_keys=True))
        if not arguments.apply:
            return 0
        if len(plan) != arguments.expected_count or digest != arguments.expected_digest:
            raise ValueError("Current Jira/app ownership differs from the approved audit")
        print(json.dumps({"written": apply_plan(client, plan)}, sort_keys=True))
        return 0
    except Exception as error:
        detail = str(error) if isinstance(error, ValueError) else "connection or tracker operation failed"
        print(f"Feedback ownership migration stopped: {type(error).__name__}: {detail}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
