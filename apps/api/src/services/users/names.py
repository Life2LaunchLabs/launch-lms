"""How a person is named. Rosters, reports and official documents use the legal name; everywhere else shows
the name someone goes by (set in their portfolio's identity fields) when they've given one."""


def legal_name(user) -> str:
    return " ".join(part for part in (getattr(user, "first_name", ""), getattr(user, "last_name", "")) if part).strip()


def shown_name(user) -> str:
    """The name to show outside rosters and reports."""
    return (getattr(user, "preferred_name", "") or "").strip() or legal_name(user) or getattr(user, "username", "") or ""


def shown_first_name(user) -> str:
    """The first word of the shown name, for greetings."""
    name = (getattr(user, "preferred_name", "") or "").strip() or (getattr(user, "first_name", "") or "").strip()
    return name.split(" ")[0] if name else ""
