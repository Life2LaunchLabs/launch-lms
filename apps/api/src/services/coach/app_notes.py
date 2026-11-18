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
    AppNote(
        "Organizations and switching",
        re.compile(r"\b(organi[sz]ations?|orgs?|switch\w*|another school|other school|change schools?)\b", re.I),
        "There is no Organizations menu or page for learners, and learners don't switch between organizations: the "
        "app shows each person one view. The schools and organizations someone belongs to show up as conversations in "
        "Connect, and Discover's search can find organizations (the Filters button, Show › Organizations). Staff who "
        "manage an organization switch views from the logo at the top of the left sidebar on a computer: it opens a "
        "menu with \"User experience\" and, under Manage, each organization they run. Never tell anyone to go to "
        "\"Organizations\" or to look in Settings for this.",
    ),
    AppNote(
        "Families and parents",
        re.compile(r"\b(famil(y|ies)|kids?|child(ren)?|son|daughters?|parents?|guardians?|my teen)\b", re.I),
        "There are no linked family accounts: everyone, kids included, has their own login, and a parent can't open a "
        "child's account from their own. What works for a parent: start a space for the family from the start page by "
        "choosing \"Parent or guardian\" (\"Helping my own kid\"). The parent runs it, invites each kid to join with "
        "their own login, gives them plans and sees how each step is going. Settings has nothing about families, so "
        "don't send anyone there. Say this plainly rather than saying you can't confirm.",
    ),
    AppNote(
        "Discover search and saving",
        re.compile(r"\b(discover|search\w*|find|look(ing)? for|save|saved|saving|library|bookmark)\b", re.I),
        "Discover has a search box across the top on computers and phones (it says \"Search plans, organizations and "
        "resources\", \"Search resources\" or \"Search plans\"), and a Filters button beside it (Show: Everything, "
        "Plans, Organizations or Resources; resource types; My library). Colleges and careers are resources. To save "
        "one, open it and tap Save; saved things are under My library in Filters. In Career swipe, swipe right or tap "
        "Save. Only point to something by name in Discover if it is in the resources you were given; if it isn't, say "
        "you don't see it and suggest searching for it in Discover.",
    ),
    AppNote(
        "The name you go by",
        re.compile(r"\b(name|nick ?name|call me|go by|preferred|display name)\b", re.I),
        "Settings (Account Settings) has only First Name and Last Name, with no nickname or display name box. The name "
        "someone goes by is set on their Portfolio: tap their photo at the top (\"Edit your profile\") or the edit "
        "button by their name, and fill in \"Name you go by\" in the Your profile box. It shows around the app instead "
        "of their legal name, while teachers' rosters and reports keep the legal name. Staff also have \"What learners "
        "call you\" in Settings.",
    ),
    AppNote(
        "Sending feedback",
        re.compile(r"\b(feedback|bug|broken|report\w*|didn'?t work|doesn'?t work|not working|glitch|tell (the )?(people|team|makers?))\b", re.I),
        "To tell the people who make the app something: on a computer, Feedback is near the bottom of the left "
        "sidebar, above Settings. On a phone, open Portfolio, tap Settings at the top and choose Feedback. It opens a "
        "short form: pick what happened (I'm stuck, Something is broken, Something is confusing, Something is missing, "
        "I love this, or Something else), write a sentence, add screenshots if they help, and Send. There is no Help "
        "menu.",
    ),
)


def app_notes_for(query: str) -> str:
    """The notes whose pattern matches the message, ready to add to Coach's context, or ''."""
    matched = [note for note in APP_NOTES if note.pattern.search(query or "")]
    if not matched:
        return ""
    body = "\n\n".join(f"<app_note title=\"{note.title}\">\n{note.text}\n</app_note>" for note in matched)
    return f"\n\n<launch_lms_app_notes>\nFacts about this app. Rely on them over general knowledge.\n\n{body}\n</launch_lms_app_notes>"
