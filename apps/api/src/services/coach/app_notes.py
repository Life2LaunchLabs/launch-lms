"""Code-owned facts about the app that Coach adds when a message is about them.

Playbooks are the coaching team's knowledge and change by release; these notes describe the app itself and
ship with the code that they describe. Each joins the message only when its pattern matches, so they cost
nothing on other replies. Platform › Coach lists them with the built-in rules.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class AppNote:
    title: str
    pattern: re.Pattern
    text: str


APP_NOTES = (
    AppNote(
        "Connecting Claude",
        re.compile(r"\b(claude|anthropic|mcp|connectors?)\b", re.I),
        "This app works with Claude, Anthropic's AI assistant. An organization admin connects it on the admin side "
        "under Organization › Connect Claude. That page gives the server address to paste into Claude as a custom "
        "connector, says what Claude can do there (build plans and the badges people earn by finishing them, make "
        "interactive steps like quizzes and videos, set up requirement lists, add resources to Discover, and make "
        "report dashboards), and lists the connections so an admin can disconnect one. Claude works only in the "
        "organization picked while connecting. Only admins can connect it; anyone else can ask an admin of their "
        "organization. When asked whether the app works with Claude, say yes and say where that page is. It isn't "
        "in account settings, so don't offer that page for it.",
    ),
)


def app_notes_for(query: str) -> str:
    """The notes whose pattern matches the message, ready to add to Coach's context, or ''."""
    matched = [note for note in APP_NOTES if note.pattern.search(query or "")]
    if not matched:
        return ""
    body = "\n\n".join(f"<app_note title=\"{note.title}\">\n{note.text}\n</app_note>" for note in matched)
    return f"\n\n<launch_lms_app_notes>\nFacts about this app. Rely on them over general knowledge.\n\n{body}\n</launch_lms_app_notes>"
