"""The portfolio's skill chips in O*NET's terms, so a career page can say which of your skills a job uses.

The chips are our plain words (the web's components/Portfolio/traitOptions.ts, PORTFOLIO_STRENGTHS); each points
at the O*NET skills (2.A, 2.B) and work styles (1.D, from release 31.0) it stands for. A career uses a chip when any
of its elements is among the career's skills (careerentry.skills, from the O*NET import). Keep the chip ids here in
step with traitOptions.ts: an id there that's missing here simply never matches.
"""

from __future__ import annotations

from sqlmodel import Session, select

# A skill counts as one the job uses at this importance (O*NET's IM scale, 1 to 5) or more.
SKILL_IMPORTANCE = 3.5
# A work style counts at this impact (O*NET's WI scale, -3 to 3) or more, as well as when it's among the job's most distinctive.
STYLE_IMPACT = 2.5


def career_skills(skill_rows: list[dict[str, str]], style_rows: list[dict[str, str]], code_col: str) -> dict[str, list[str]]:
    """Each career's skills (importance SKILL_IMPORTANCE or more) and its key work styles, by element id. Work styles
    from release 31.0 carry an impact (WI) and a distinctiveness rank (DR, 1 to 10 for the job's top styles): a style
    counts when either is high. Older releases rate styles by importance like skills."""
    ranked: dict[str, list[tuple[int, float, str]]] = {}

    def add(code: str, element: str, kind: int, value: float) -> None:
        bucket = ranked.setdefault(code, [])
        if element and not any(item[2] == element for item in bucket):
            bucket.append((kind, -value, element))

    for r in skill_rows:
        if r.get("scale id", "").upper() != "IM" or r.get("recommend suppress", "").upper() == "Y":
            continue
        try:
            value = float(r.get("data value", ""))
        except ValueError:
            continue
        if value >= SKILL_IMPORTANCE:
            add(r.get(code_col, ""), r.get("element id", ""), 0, value)
    for r in style_rows:
        scale = r.get("scale id", "").upper()
        try:
            value = float(r.get("data value", ""))
        except ValueError:
            continue
        if (scale == "DR" and value > 0) or (scale == "WI" and value >= STYLE_IMPACT) or (scale == "IM" and value >= SKILL_IMPORTANCE):
            # Ranked together: a distinctiveness rank (1 to 10), impact (up to 3) and older importance (up to 5) on one scale.
            add(r.get(code_col, ""), r.get("element id", ""), 1, value if scale == "DR" else value * 10 / 3 if scale == "WI" else value * 2)
    return {code: [element for _, _, element in sorted(rows)] for code, rows in ranked.items()}


# Chip id -> O*NET element ids.
CHIPS: dict[str, tuple[str, ...]] = {
    # Thinking
    "analysis": ("2.A.2.a", "2.B.4.g"),                 # Critical Thinking, Systems Analysis
    "strategy": ("2.B.4.h", "2.B.4.e"),                 # Systems Evaluation, Judgment and Decision Making
    "problem-solving": ("2.B.2.i",),                    # Complex Problem Solving
    "systems-thinking": ("2.B.4.g", "2.B.4.h"),
    "decision-making": ("2.B.4.e",),
    # Creating
    "storytelling": ("2.A.1.c", "2.A.1.d"),             # Writing, Speaking
    "design-sense": ("2.B.3.b", "1.D.1.a"),             # Technology Design, Innovation
    "experimentation": ("2.A.1.f", "1.D.1.c"),          # Science, Intellectual Curiosity
    "originality": ("1.D.1.a",),
    "making-ideas-real": ("1.D.1.e", "2.B.3.b"),        # Initiative, Technology Design
    # Working with others
    "collaboration": ("2.B.1.b", "1.D.2.d"),            # Coordination, Cooperation
    "facilitation": ("2.B.1.e", "2.B.5.d"),             # Instructing, Management of Personnel Resources
    "mentoring": ("2.A.2.c", "2.B.1.e"),                # Learning Strategies, Instructing
    "listening": ("2.A.1.b",),                          # Active Listening
    "conflict-navigation": ("2.B.1.d", "2.B.1.c"),      # Negotiation, Persuasion
    "reading-people": ("2.B.1.a",),                     # Social Perceptiveness
    "explaining-things": ("2.B.1.e", "2.A.1.d"),        # Instructing, Speaking
    "helping-out": ("2.B.1.f",),                        # Service Orientation
    "persuading": ("2.B.1.c",),                         # Persuasion
    "leading-a-group": ("2.B.5.d", "1.D.1.i"),          # Management of Personnel Resources, Leadership Orientation
    # Hands-on
    "fixing-things": ("2.B.3.l", "2.B.3.j"),            # Repairing, Equipment Maintenance
    "finding-what-s-wrong": ("2.B.3.k",),               # Troubleshooting
    "putting-things-together": ("2.B.3.d",),            # Installation
    "running-machines": ("2.B.3.h", "2.B.3.g"),         # Operation and Control, Operations Monitoring
    "checking-quality": ("2.B.3.m",),                   # Quality Control Analysis
    "coding": ("2.B.3.e",),                             # Programming
    "working-with-numbers": ("2.A.1.e",),               # Mathematics
    # How you work
    "focus": ("1.D.4.b",),                              # Self-Control
    "follow-through": ("1.D.3.c", "1.D.1.h"),           # Dependability, Perseverance
    "organization": ("2.B.5.a", "2.B.5.c"),             # Time Management, Management of Material Resources
    "adaptability": ("1.D.1.f",),
    "initiative": ("1.D.1.e",),
    "attention-to-detail": ("1.D.3.b",),
    "dependable": ("1.D.3.c",),
    "staying-calm": ("1.D.4.a",),                       # Stress Tolerance
    "caring": ("1.D.2.c",),                             # Empathy
    "curious": ("1.D.1.c",),                            # Intellectual Curiosity
}
SKILLS_TEMPLATE = "skills-values"


def used(chips: list[str], career_skills: list[str]) -> list[str]:
    """The chips (in the learner's order) whose O*NET elements the career leans on."""
    have = set(career_skills or [])
    return [chip for chip in chips if any(element in have for element in CHIPS.get(chip, ()))]


def my_chips(db: Session, user_id: int) -> list[str] | None:
    """The skill chips the learner picked in their portfolio's "Skills and values", or None if they haven't."""
    from src.db.portfolio import Portfolio
    from src.db.portfolio_records import PortfolioResult

    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == user_id)).first()
    if not portfolio:
        return None
    rows = db.exec(select(PortfolioResult).where(PortfolioResult.portfolio_id == portfolio.id, PortfolioResult.kind == "skills")).all()
    picked: list[str] = []
    found = False
    for row in rows:
        data = row.data or {}
        if data.get("template") != SKILLS_TEMPLATE:
            continue
        found = True
        picked += [chip for chip in data.get("skills") or [] if isinstance(chip, str) and chip not in picked]
    return picked if found else None
