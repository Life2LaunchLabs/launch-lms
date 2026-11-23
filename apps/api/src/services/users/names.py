"""How a person is named. Rosters, reports and official documents use the legal name; everywhere else shows
the name someone goes by (set in their portfolio's identity fields) when they've given one."""

# Words people put before a family name ("Ms. Rivera", "Coach Diaz"). A greeting keeps them with the name (DEV-204).
TITLES = frozenset({"mr", "mrs", "ms", "mx", "miss", "dr", "prof", "coach", "rev", "fr", "sr", "sra", "srta", "sir", "madam"})


def legal_name(user) -> str:
    return " ".join(part for part in (getattr(user, "first_name", ""), getattr(user, "last_name", "")) if part).strip()


def shown_name(user) -> str:
    """The name to show outside rosters and reports."""
    return (getattr(user, "preferred_name", "") or "").strip() or legal_name(user) or getattr(user, "username", "") or ""


def first_name_of(name: str | None, last_name: str | None = None) -> str:
    """The short form of a name for greetings and "Sam's portfolio": its first word, unless the name starts with a
    title, which is kept with the rest ("Ms. Rivera", not "Ms."). A bare title borrows the last name."""
    words = (name or "").split()
    if not words:
        return ""
    if words[0].rstrip(".").lower() in TITLES:
        if len(words) > 1:
            return " ".join(words)
        return " ".join(part for part in (words[0], (last_name or "").strip()) if part)
    return words[0]


def shown_first_name(user) -> str:
    """The name to greet someone by: the name they go by, else their legal first name (see first_name_of)."""
    preferred = (getattr(user, "preferred_name", "") or "").strip()
    if preferred:
        return first_name_of(preferred)
    return first_name_of(getattr(user, "first_name", ""), getattr(user, "last_name", ""))
