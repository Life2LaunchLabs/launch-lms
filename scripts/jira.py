#!/usr/bin/env python3
"""Read Launch LMS Jira with the same environment contract used by Symphony."""

from __future__ import annotations

import argparse
import json

from jira_rest import JiraClient, JiraError, settings, summarize


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file")
    parser.add_argument("--project", choices=["BOT", "FEED"], default="BOT")
    sub = parser.add_subparsers(dest="command", required=True)
    show = sub.add_parser("show")
    show.add_argument("issue")
    sub.add_parser("board")
    workpad = sub.add_parser("workpad")
    workpad.add_argument("issue")
    workpad.add_argument("--append", required=True)
    workpad.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    client = JiraClient(settings(args.project, args.env_file))
    if args.command == "show":
        print(json.dumps(summarize(client.issue(args.issue.upper())), indent=2, ensure_ascii=False))
    elif args.command == "workpad":
        key = args.issue.upper()
        comments = summarize(client.issue(key))["comments"]
        workpad = next((item for item in comments if item["body"].lstrip().startswith("Symphony workpad")), None)
        if not workpad:
            raise JiraError(f"{key} has no Symphony workpad comment")
        updated = workpad["body"].rstrip() + "\n\n" + args.append.strip()
        if args.apply:
            client.update_comment(key, workpad["id"], updated)
        print(json.dumps({"issue": key, "comment_id": workpad["id"], "appended_characters": len(args.append.strip()), "applied": args.apply}, indent=2))
    else:
        key = client.project.replace('"', '\\"')
        issues = client.search(f'project = "{key}" ORDER BY created ASC')
        for issue in issues:
            item = summarize(issue)
            print(f'{item["status"]:<16} {item["key"]:<10} {item["summary"]}')


if __name__ == "__main__":
    try:
        main()
    except JiraError as error:
        raise SystemExit(str(error)) from None
