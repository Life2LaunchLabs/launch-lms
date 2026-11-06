"""The portfolio's skill chips in O*NET's terms, so a career page can say which of your skills a job uses.

The chips are our plain words (the web's components/Portfolio/traitOptions.ts, PORTFOLIO_STRENGTHS); each points
at the O*NET skills (2.A, 2.B) and work styles (1.D, from release 31.0) it stands for. A career uses a chip when any
of its elements is among the career's skills (careerentry.skills, from the O*NET import). Keep the chip ids here in
step with traitOptions.ts: an id there that's missing here simply never matches.
"""

from __future__ import annotations

from sqlmodel import Session, select

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
