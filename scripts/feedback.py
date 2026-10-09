#!/usr/bin/env python3
"""Audit, triage, link, and reconcile Launch LMS tester feedback."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from feedback_ops import (
    audit,
    create_work,
    link_feedback,
    load_policy,
    migrate_legacy,
    reconcile,
    resolve_roles,
    slug,
    triage,
    validate_delivery_roles,
)
from jira_rest import JiraClient, JiraError, settings, summarize

ROOT = Path(__file__).resolve().parents[1]


def clients(args):
    return JiraClient(settings("FEED", args.env_file)), JiraClient(settings("BOT", args.env_file))


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--env-file")
    result.add_argument("--policy", type=Path, default=ROOT / "docs/product/feedback-policy.yaml")
    sub = result.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor")
    sub.add_parser("audit")
    migrate = sub.add_parser("migrate-legacy"); migrate.add_argument("--apply", action="store_true")
    show = sub.add_parser("show"); show.add_argument("issue")
    intake = sub.add_parser("triage")
    intake.add_argument("issue"); intake.add_argument("--concept", required=True); intake.add_argument("--title")
    intake.add_argument("--impact", type=int, choices=range(1, 6), required=True)
    intake.add_argument("--decision", required=True); intake.add_argument("--rationale", required=True)
    intake.add_argument("--public-note", default=""); intake.add_argument("--apply", action="store_true")
    link = sub.add_parser("link"); link.add_argument("issue"); link.add_argument("--bot", required=True); link.add_argument("--apply", action="store_true")
    work = sub.add_parser("create-work")
    work.add_argument("--concept", required=True); work.add_argument("--summary", required=True); work.add_argument("--outcome", required=True)
    work.add_argument("--context", required=True); work.add_argument("--build-notes", default=""); work.add_argument("--test", action="append", required=True)
    work.add_argument("--deliverable", action="append", default=[])
    work.add_argument("--priority", choices=["Highest", "High", "Medium", "Low", "Lowest"], required=True); work.add_argument("--apply", action="store_true")
    sync = sub.add_parser("reconcile"); sync.add_argument("--apply", action="store_true")
    return result


def main() -> None:
    args = parser().parse_args()
    policy = load_policy(args.policy)
    feed, bot = clients(args)
    if args.command == "doctor":
        roles = resolve_roles(feed, policy["workflow"]["feedback_status_roles"])
        delivery = validate_delivery_roles(bot, policy["workflow"]["delivery_status_roles"])
        print(json.dumps({
            "policy": "valid",
            "feedback_status_roles": {key: {"id": str(value["id"]), "name": value["name"]} for key, value in roles.items()},
            "delivery_status_roles": {key: [{"id": str(value["id"]), "name": value["name"]} for value in values] for key, values in delivery.items()},
        }, indent=2))
    elif args.command == "audit":
        print(json.dumps(audit(feed, bot, policy), indent=2, ensure_ascii=False))
    elif args.command == "migrate-legacy":
        print(json.dumps(migrate_legacy(feed, bot, policy, args.apply), indent=2, ensure_ascii=False))
    elif args.command == "show":
        print(json.dumps(summarize(feed.issue(args.issue.upper())), indent=2, ensure_ascii=False))
    elif args.command == "triage":
        concept = slug(args.concept)
        value = triage(feed, policy, args.issue.upper(), concept, args.title or args.concept, args.impact, args.decision, args.rationale, args.public_note, args.apply)
        print(json.dumps(value, indent=2))
    elif args.command == "link":
        print(json.dumps(link_feedback(feed, policy, args.issue.upper(), args.bot.upper(), args.apply), indent=2))
    elif args.command == "create-work":
        value = create_work(feed, bot, policy, slug(args.concept), args.summary, args.outcome, args.context, args.build_notes, args.test, args.deliverable, args.priority, args.apply)
        print(json.dumps(value, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(reconcile(feed, bot, policy, args.apply), indent=2))


if __name__ == "__main__":
    try:
        main()
    except JiraError as error:
        raise SystemExit(str(error)) from None
