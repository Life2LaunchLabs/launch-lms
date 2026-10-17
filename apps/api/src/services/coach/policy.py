"""Coach's platform policy: method, knowledge, routines, abilities and models.

Admins edit it on Platform › Coach. Everything Coach runs reads it through ``runtime()``, which
returns a plain snapshot (from the control database in a demo, since demos never copy platform
settings). The rules Launch LMS owns in code (tool contracts, output formats, the never-create-a-goal
rule) aren't editable, but ``built_in_rules()`` shows them so nothing that shapes Coach is hidden.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.coach import (
    TIERS, CoachOrder, CoachPlaybook, CoachPlaybookWrite, CoachPolicy, CoachPolicyUpdate, CoachProviderKey,
    CoachRoutine, CoachRoutineWrite, CoachModelSettings,
)
from src.db.users import PublicUser
from src.services.coach.keys import decrypt_api_key, key_dict, list_keys

POLICY_ID = 1

DEFAULT_METHOD = """# How Coach coaches

You are Coach, the Launch LMS learning coach. Help a learner clarify goals, consider realistic next steps, and reflect on tradeoffs.

## Voice

Warm, concise and practical. Ask at most one useful follow-up question at a time.

## Next steps

When a Launch LMS surface would materially help the learner continue, suggest one relevant learner-controlled action after giving useful advice.

## Honesty

Don't claim to have searched Launch LMS resources, accessed private data, remembered earlier sessions, navigated, or changed anything unless the application-provided context establishes it.
"""

SAFETY_PLAYBOOK = """Don't present medical, legal, financial, or crisis guidance as professional advice. Encourage the learner to reach appropriate qualified or emergency help when they need it, and a trusted adult when something feels unsafe."""

# Routines a new platform starts with: the voice the note and story writers used before routines existed.
SEED_ROUTINES = (
    ("Check-in notes", "goal_check_in", 'Write in a warm, plain voice, speaking to the learner as "you". Notice; never nag, guilt or pressure.'),
    ("Finish story", "goal_finished", "Plain words; no exclamation marks, no clichés."),
)

# (key, group, label, detail); every ability starts on. Groups read top to bottom on the Abilities tab.
ABILITY_GROUPS = (
    ("reads", "What Coach reads"),
    ("chat", "In the Coach chat"),
    ("own", "On its own"),
)
ABILITIES = (
    ("read_page", "reads", "The page the learner is on", "The goal in view, its stages and steps, and the learner's saved answers. Never reviewer or staff notes, files, or other people on a goal."),
    ("read_memory", "reads", "What it remembers about the learner", "Saved memories, which the learner can see and edit in Account › Memory."),
    ("read_resources", "reads", "Organization resources", "Courses, badges and other resources the learner can open."),
    ("open_pages", "chat", "Offer to open a page", "A button under a reply that takes the learner somewhere in the app."),
    ("ask_questions", "chat", "Ask quick questions", "Tap-to-answer question sets under a reply."),
    ("plan_goals", "chat", "Plan a goal with the learner", "Suggests stages and steps as quiet lines on the goal page. The learner keeps or drops each one."),
    ("remember", "chat", "Remember what the learner shares", "Saves memories from the learner's messages, when the learner has memory turned on."),
    ("goal_notes", "own", "Leave notes on goals", "Check-ins that show on a goal's Coach bar."),
    ("finish_story", "own", "Write the finish story", "The opening and closing lines of a finished goal's story. When off, the story uses fixed wording."),
)
ABILITY_KEYS = {item[0] for item in ABILITIES}

# Moments Coach acts on. A routine attaches instructions to one; the output each moment produces is fixed in code.
TRIGGERS = {
    "learner_message": {"label": "The learner sends a message", "detail": "Added to every reply in the Coach chat.", "tier": "standard"},
    "planning_session": {"label": "The learner plans a goal with Coach", "detail": "Added while Coach and the learner plan a goal together on the goal page.", "tier": "standard"},
    "goal_check_in": {"label": "A goal's check-in is due", "detail": "Weekly or monthly on the learner's cadence, soon after a goal is created, and after a stage is finished. Coach leaves up to three notes on the goal's Coach bar.", "tier": "standard"},
    "goal_finished": {"label": "A goal is finished", "detail": "Coach writes the opening and closing lines of the finish story.", "tier": "standard"},
}
TIER_ORDER = {tier: index for index, tier in enumerate(TIERS)}
TIER_USES = {"fast": "Remembering what the learner shares"}

MAX_KNOWLEDGE_CHARS = 12_000
MATCHED_PLAYBOOKS = 2
_WORDS = re.compile(r"[a-z0-9]+")
_STOP = {"about", "after", "also", "been", "from", "have", "into", "just", "like", "more", "much", "that", "their", "them", "then", "they", "this", "what", "when", "where", "which", "while", "with", "would", "your", "want", "need", "help"}


def _terms(text: str) -> set[str]:
    return {word for word in _WORDS.findall(text.casefold()) if len(word) >= 4 and word not in _STOP}


@dataclass(frozen=True)
class CoachModel:
    provider: str
    api_key: str
    model: str
    settings: dict


@dataclass(frozen=True)
class CoachRuntime:
    """The policy as Coach uses it, detached from any database session."""

    enabled: bool
    method: str
    abilities: dict[str, bool]
    tiers: dict[str, dict]
    keys: dict[str, tuple[str, str]] = field(default_factory=dict)
    playbooks: tuple[dict, ...] = ()
    routines: tuple[dict, ...] = ()

    def can(self, ability: str) -> bool:
        return bool(self.abilities.get(ability, True))

    def model(self, tier: str) -> CoachModel:
        """The model a tier runs on. A tier with no key falls back to Standard. Raises RuntimeError when none is set up."""
        for name in (tier, "standard"):
            config = self.tiers.get(name) or {}
            key = self.keys.get(config.get("key_uuid") or "")
            if key and (config.get("model") or "").strip():
                provider, ciphertext = key
                return CoachModel(provider, decrypt_api_key(ciphertext), config["model"].strip(), {**CoachModelSettings().model_dump(), **(config.get("settings") or {})})
        raise RuntimeError("Coach is not configured or enabled.")

    def routines_for(self, trigger: str) -> list[dict]:
        return [routine for routine in self.routines if routine["trigger"] == trigger]

    def tier_for(self, trigger: str) -> str:
        """The highest tier among the trigger's routines, or the trigger's default."""
        tiers = [routine["tier"] for routine in self.routines_for(trigger) if routine["tier"] in TIER_ORDER]
        return max(tiers, key=TIER_ORDER.__getitem__) if tiers else TRIGGERS[trigger]["tier"]

    def knowledge(self, query: str = "") -> str:
        """Playbooks marked always, then up to two whose title or "used when" share the most words with the query."""
        terms = _terms(query)
        chosen = [book for book in self.playbooks if book["always"]]
        scored = sorted(
            ((len(terms & _terms(f"{book['title']} {book['used_when']}")), index, book) for index, book in enumerate(self.playbooks) if not book["always"]),
            key=lambda item: (-item[0], item[1]),
        )
        chosen += [book for score, _, book in scored[:MATCHED_PLAYBOOKS] if score > 0]
        parts, total = [], 0
        for book in chosen:
            text = f"<coach_playbook title=\"{book['title']}\">\n{book['body'].strip()}\n</coach_playbook>"
            if total + len(text) > MAX_KNOWLEDGE_CHARS:
                continue
            parts.append(text)
            total += len(text)
        return "\n\n".join(parts)

    def instructions(self, *triggers: str, query: str = "", contract: str = "") -> str:
        """Coach's system instructions: the method, matching knowledge, the triggers' routines, then any fixed output contract."""
        parts = [self.method.strip() or DEFAULT_METHOD.strip()]
        knowledge = self.knowledge(query)
        if knowledge:
            parts.append(f"<coach_knowledge>\nPlaybooks from the coaching team. Follow them where they apply.\n\n{knowledge}\n</coach_knowledge>")
        for trigger in triggers:
            for routine in self.routines_for(trigger):
                if routine["instructions"].strip():
                    parts.append(f"<coach_routine name=\"{routine['name']}\" when=\"{TRIGGERS[trigger]['label']}\">\n{routine['instructions'].strip()}\n</coach_routine>")
        if contract.strip():
            parts.append(contract.strip())
        return "\n\n".join(parts)


def _load(db: Session) -> CoachRuntime:
    policy = db.get(CoachPolicy, POLICY_ID)
    playbooks = db.exec(select(CoachPlaybook).where(CoachPlaybook.enabled == True).order_by(CoachPlaybook.position, CoachPlaybook.id)).all()  # noqa: E712
    routines = db.exec(select(CoachRoutine).where(CoachRoutine.enabled == True, CoachRoutine.trigger.in_(list(TRIGGERS))).order_by(CoachRoutine.position, CoachRoutine.id)).all()  # type: ignore[attr-defined]  # noqa: E712
    return CoachRuntime(
        enabled=bool(policy and policy.enabled),
        method=policy.method if policy and policy.method.strip() else DEFAULT_METHOD,
        abilities=_abilities(policy),
        tiers=dict((policy.tiers if policy else None) or {}),
        keys={key.key_uuid: (key.provider, key.ciphertext) for key in db.exec(select(CoachProviderKey)).all()},
        playbooks=tuple({"title": book.title, "used_when": book.used_when, "body": book.body, "always": book.always} for book in playbooks),
        routines=tuple({"name": item.name, "trigger": item.trigger, "instructions": item.instructions, "tier": item.tier} for item in routines),
    )


def runtime(db: Session) -> CoachRuntime:
    from src.services.demo.providers import platform_read

    return platform_read(db, _load)


def _abilities(policy: CoachPolicy | None) -> dict[str, bool]:
    saved = (policy.abilities if policy else None) or {}
    return {key: bool(saved.get(key, True)) for key in ABILITY_KEYS}


# Admin -------------------------------------------------------------------


def seed_defaults(db: Session) -> None:
    """Give a new platform the starting method, the Safety playbook and the seed routines. Existing platforms got them from their migration."""
    if db.get(CoachPolicy, POLICY_ID) is not None:
        return
    db.add(CoachPolicy(id=POLICY_ID, method=DEFAULT_METHOD))
    db.add(CoachPlaybook(playbook_uuid=f"coach_playbook_{uuid4().hex}", title="Safety", used_when="Every conversation", body=SAFETY_PLAYBOOK, always=True))
    for position, (name, trigger, instructions) in enumerate(SEED_ROUTINES):
        db.add(CoachRoutine(routine_uuid=f"coach_routine_{uuid4().hex}", name=name, trigger=trigger, instructions=instructions, position=position))
    db.commit()


def _policy(db: Session) -> CoachPolicy:
    policy = db.get(CoachPolicy, POLICY_ID)
    if policy is None:
        policy = CoachPolicy(id=POLICY_ID, method=DEFAULT_METHOD)
    return policy


def built_in_rules() -> list[dict]:
    from src.services.goals.check_ins import NOTE_WRITER_INSTRUCTIONS
    from src.services.goals.story import STORY_WRITER_INSTRUCTIONS
    from src.services.hub_actions import CAPABILITY_POLICY_INSTRUCTIONS
    from src.services.hub_advisor import PLANNING_SESSION_RULES, REPLY_RULES

    return [
        {"title": "Every reply", "text": REPLY_RULES.strip()},
        {"title": "Suggested actions", "text": CAPABILITY_POLICY_INSTRUCTIONS.strip()},
        {"title": "Planning sessions", "text": PLANNING_SESSION_RULES.strip()},
        {"title": "Check-in notes (output format)", "text": NOTE_WRITER_INSTRUCTIONS.strip()},
        {"title": "Finish story (output format)", "text": STORY_WRITER_INSTRUCTIONS.strip()},
    ]


def _tiers_view(db: Session, policy: CoachPolicy) -> dict:
    keys = {key.key_uuid: key for key in list_keys(db)}
    view = {}
    for tier in TIERS:
        saved = (policy.tiers or {}).get(tier) or {}
        key = keys.get(saved.get("key_uuid") or "")
        view[tier] = {
            "key_uuid": key.key_uuid if key else "", "provider": key.provider if key else None,
            "model": saved.get("model") or "", "settings": {**CoachModelSettings().model_dump(), **(saved.get("settings") or {})},
        }
    return view


def _routine_dict(routine: CoachRoutine) -> dict:
    return {
        "routine_uuid": routine.routine_uuid, "name": routine.name, "trigger": routine.trigger, "instructions": routine.instructions,
        "tier": routine.tier, "enabled": routine.enabled, "updated_at": routine.updated_at,
    }


def _playbook_dict(book: CoachPlaybook) -> dict:
    return {
        "playbook_uuid": book.playbook_uuid, "title": book.title, "used_when": book.used_when, "body": book.body,
        "always": book.always, "enabled": book.enabled, "updated_at": book.updated_at,
    }


def policy_view(db: Session) -> dict:
    policy = _policy(db)
    abilities = _abilities(policy)
    return {
        "enabled": policy.enabled,
        "method": policy.method if policy.method.strip() else DEFAULT_METHOD,
        "ability_groups": [{"key": key, "label": label} for key, label in ABILITY_GROUPS],
        "abilities": [{"key": key, "group": group, "label": label, "detail": detail, "enabled": abilities[key]} for key, group, label, detail in ABILITIES],
        "tiers": _tiers_view(db, policy),
        "tier_uses": _tier_uses(db),
        "keys": [key_dict(key) for key in list_keys(db)],
        "triggers": [{"key": key, **value} for key, value in TRIGGERS.items()],
        "routines": [_routine_dict(item) for item in _routines(db)],
        "playbooks": [_playbook_dict(item) for item in _playbooks(db)],
        "built_in_rules": built_in_rules(),
        "updated_at": policy.updated_at,
    }


def _tier_uses(db: Session) -> dict[str, list[str]]:
    """What runs on each tier, in words, for the Model tab."""
    uses: dict[str, list[str]] = {tier: [] for tier in TIERS}
    snapshot = _load(db)
    for key, trigger in TRIGGERS.items():
        uses[snapshot.tier_for(key)].append(trigger["label"])
    for tier, label in TIER_USES.items():
        uses[tier].append(label)
    return uses


def update_policy(db: Session, current_user: PublicUser, payload: CoachPolicyUpdate) -> dict:
    policy = _policy(db)
    if payload.method is not None:
        policy.method = payload.method.strip()
    if payload.abilities is not None:
        unknown = set(payload.abilities) - ABILITY_KEYS
        if unknown:
            raise HTTPException(status_code=422, detail=f"Unknown abilities: {', '.join(sorted(unknown))}.")
        policy.abilities = {**(policy.abilities or {}), **payload.abilities}
    if payload.tiers is not None:
        keys = {key.key_uuid for key in list_keys(db)}
        tiers = dict(policy.tiers or {})
        for tier, value in payload.tiers.items():
            if value.key_uuid and value.key_uuid not in keys:
                raise HTTPException(status_code=422, detail=f"The key chosen for {tier.capitalize()} no longer exists.")
            if value.key_uuid and not value.model.strip():
                raise HTTPException(status_code=422, detail=f"Choose a model for {tier.capitalize()}.")
            tiers[tier] = {"key_uuid": value.key_uuid, "model": value.model.strip(), "settings": value.settings.model_dump()}
        policy.tiers = tiers
    if payload.enabled is not None:
        policy.enabled = payload.enabled
    if policy.enabled:
        standard = (policy.tiers or {}).get("standard") or {}
        if not standard.get("key_uuid") or not standard.get("model"):
            raise HTTPException(status_code=422, detail="Give the Standard tier a key and a model before turning Coach on.")
    policy.updated_by_user_id = current_user.id
    policy.updated_at = datetime.utcnow()
    db.add(policy)
    db.commit()
    return policy_view(db)


def _playbooks(db: Session) -> list[CoachPlaybook]:
    return list(db.exec(select(CoachPlaybook).order_by(CoachPlaybook.position, CoachPlaybook.id)).all())


def _routines(db: Session) -> list[CoachRoutine]:
    return list(db.exec(select(CoachRoutine).order_by(CoachRoutine.position, CoachRoutine.id)).all())


def _find(db: Session, model, column, value: str, label: str):
    row = db.exec(select(model).where(column == value)).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"{label} not found.")
    return row


def save_playbook(db: Session, current_user: PublicUser, payload: CoachPlaybookWrite, playbook_uuid: str | None = None) -> dict:
    if playbook_uuid:
        book = _find(db, CoachPlaybook, CoachPlaybook.playbook_uuid, playbook_uuid, "Playbook")
    else:
        book = CoachPlaybook(playbook_uuid=f"coach_playbook_{uuid4().hex}", title="", position=len(_playbooks(db)))
    book.title, book.used_when, book.body = payload.title.strip(), payload.used_when.strip(), payload.body.strip()
    book.always, book.enabled = payload.always, payload.enabled
    book.updated_by_user_id, book.updated_at = current_user.id, datetime.utcnow()
    db.add(book)
    db.commit()
    db.refresh(book)
    return _playbook_dict(book)


def delete_playbook(db: Session, playbook_uuid: str) -> None:
    db.delete(_find(db, CoachPlaybook, CoachPlaybook.playbook_uuid, playbook_uuid, "Playbook"))
    db.commit()


def save_routine(db: Session, current_user: PublicUser, payload: CoachRoutineWrite, routine_uuid: str | None = None) -> dict:
    if payload.trigger not in TRIGGERS:
        raise HTTPException(status_code=422, detail="Choose one of the listed triggers.")
    if routine_uuid:
        routine = _find(db, CoachRoutine, CoachRoutine.routine_uuid, routine_uuid, "Routine")
    else:
        routine = CoachRoutine(routine_uuid=f"coach_routine_{uuid4().hex}", name="", trigger=payload.trigger, position=len(_routines(db)))
    routine.name, routine.trigger, routine.instructions = payload.name.strip(), payload.trigger, payload.instructions.strip()
    routine.tier, routine.enabled = payload.tier, payload.enabled
    routine.updated_by_user_id, routine.updated_at = current_user.id, datetime.utcnow()
    db.add(routine)
    db.commit()
    db.refresh(routine)
    return _routine_dict(routine)


def delete_routine(db: Session, routine_uuid: str) -> None:
    db.delete(_find(db, CoachRoutine, CoachRoutine.routine_uuid, routine_uuid, "Routine"))
    db.commit()


def reorder(db: Session, kind: str, payload: CoachOrder) -> list[dict]:
    column, rows, view = (
        ("playbook_uuid", _playbooks(db), _playbook_dict) if kind == "playbooks"
        else ("routine_uuid", _routines(db), _routine_dict)
    )
    by_uuid = {getattr(row, column): row for row in rows}
    ordered = [by_uuid[uuid] for uuid in payload.uuids if uuid in by_uuid]
    ordered += [row for row in rows if row not in ordered]
    for position, row in enumerate(ordered):
        row.position = position
        db.add(row)
    db.commit()
    return [view(row) for row in ordered]

