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
    args = parser.parse_args()
    client = JiraClient(settings(args.project, args.env_file))
    if args.command == "show":
        print(json.dumps(summarize(client.issue(args.issue.upper())), indent=2, ensure_ascii=False))
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
