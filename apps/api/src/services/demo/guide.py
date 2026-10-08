"""The visitor guide: markdown pages, each scoped to one demo user or to every demo user.

A user's pages live on DemoMember.guide as {"pages": [...]}; pages shared by every demo
user live on DemoConfiguration.guide_pages (NULL means the built-in defaults below).
Visitors see the shared pages first, then the user's own, grouped under section titles.

Bodies are markdown. Placeholders fill in the current demo user: {{first_name}},
{{name}}, {{role_line}} and {{description}}. A line holding only {{section:Title}}
shows that section's pages as cards.
"""

from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session
from src.services.demo.configuration import configuration

MAX_PAGES = 20


class GuidePage(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:8], min_length=1, max_length=40)
    section: str = Field(default="", max_length=60)
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(default="", max_length=10000)
    # A "try" page is a suggested action: visitors can jump to it and rate it.
    kind: Literal["page", "try"] = "page"
    minutes: int | None = Field(default=None, ge=1, le=120)
    link_label: str = Field(default="", max_length=60)
    link_path: str = Field(default="", max_length=300)

    @field_validator("section", "title", "link_label", mode="before")
    @classmethod
    def trimmed(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("link_path")
    @classmethod
    def relative(cls, value: str) -> str:
        if value and (not value.startswith("/") or value.startswith("//")):
            raise ValueError("Links must be paths on this site, starting with /.")
        return value


class GuidePages(BaseModel):
    pages: list[GuidePage] = Field(default_factory=list, max_length=MAX_PAGES)

    @field_validator("pages")
    @classmethod
    def unique_ids(cls, value: list[GuidePage]) -> list[GuidePage]:
        if len({page.id for page in value}) != len(value):
            raise ValueError("Each guide page needs its own id.")
        return value


HOW_IT_WORKS = """You're using a private copy of {{first_name}}'s account. Nobody else sees what you do, and it's discarded when you leave or after a while (you can add time).

### What works
Badges, activities, portfolio, plans and the AI coach work for real. The coach has a demo allowance.

### What's switched off
Emails aren't sent. Payments and publishing to outside services are off; the app tells you when you reach one.

### Start over or switch
Use the menu on {{first_name}}'s name in the top bar to start over or try someone else.

### Tell us what you think
Use Feedback in the top bar any time. It goes straight to the team building this."""

DEFAULT_SHARED_PAGES = [GuidePage(id="how", section="About", title="How this demo works", body=HOW_IT_WORKS)]


def _bullets(items: list) -> str:
    return "\n".join(f"- {item}" for item in items if isinstance(item, str) and item.strip())


def user_pages(guide: dict | None) -> list[dict]:
    """A user's own pages, converting the earlier goals/has/journeys guide on read."""
    guide = guide or {}
    if "pages" in guide:
        return [GuidePage(**page).model_dump() for page in guide["pages"]]
    journeys = [journey for journey in guide.get("journeys", []) if journey.get("title")]
    parts = ["_{{role_line}}_", "{{description}}"]
    if _bullets(guide.get("goals", [])):
        parts.append("### What {{first_name}} wants\n" + _bullets(guide["goals"]))
    if _bullets(guide.get("has", [])):
        parts.append("### Already in {{first_name}}'s account\n" + _bullets(guide["has"]))
    parts.append("### Things to try\n{{section:Things to try}}" if journeys else "Explore freely. Everything in {{first_name}}'s account is yours to change.")
    pages = [GuidePage(id="meet", title="Meet {{name}}", body="\n\n".join(parts))]
    for journey in journeys:
        steps = "\n".join(f"{index}. {step}" for index, step in enumerate(journey.get("steps", []), 1))
        pages.append(GuidePage(
            id=journey.get("id") or uuid4().hex[:8], section="Things to try", title=journey["title"], kind="try",
            body="\n\n".join(part for part in [journey.get("why", ""), steps] if part),
            minutes=journey.get("minutes"), link_label=journey.get("link_label", ""), link_path=journey.get("link_path", ""),
        ))
    return [page.model_dump() for page in pages]


def shared_pages(db: Session) -> list[dict]:
    stored = configuration(db).guide_pages
    pages = [GuidePage(**page) for page in stored] if stored is not None else DEFAULT_SHARED_PAGES
    return [page.model_dump() for page in pages]


def save_shared_pages(db: Session, body: GuidePages) -> list[dict]:
    config = configuration(db, lock=True)
    config.guide_pages = [page.model_dump() for page in body.pages]
    db.add(config)
    db.commit()
    return shared_pages(db)


def visitor_guide(db: Session, member_guide: dict | None) -> list[dict]:
    """Everything a visitor sees, in order, with each page's scope."""
    own = [{**page, "scope": "user"} for page in user_pages(member_guide)]
    taken = {page["id"] for page in own}
    shared = [{**page, "scope": "global"} for page in shared_pages(db) if page["id"] not in taken]
    return shared + own


def try_titles(member_guide: dict | None, limit: int = 3) -> list[str]:
    return [page["title"] for page in user_pages(member_guide) if page["kind"] == "try"][:limit]
