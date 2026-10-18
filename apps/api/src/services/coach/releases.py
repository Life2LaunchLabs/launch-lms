"""Coach releases: admins edit a draft of the coaching policy and release it when it's ready.

Every tab on Platform › Coach edits the draft. Releasing freezes the draft's method, abilities,
models, playbooks and routines into a numbered release, and learners get the release that is
live. Rolling back releases an earlier version again under a new number, so the history only
grows. Turning Coach on or off, provider keys and the conversation starters apply at once.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.coach import CoachPlaybook, CoachPolicy, CoachRelease, CoachRoutine
from src.db.users import PublicUser, User
from src.services.coach import policy as coach_policy

ABILITY_LABELS = {key: label for key, _group, label, _detail in coach_policy.ABILITIES}


def _quoted(item: dict, key: str) -> str:
    return f"“{item.get(key) or 'Untitled'}”"


def _list_changes(old: list[dict], new: list[dict], uuid_key: str, title_key: str, noun: str) -> list[str]:
    before = {item[uuid_key]: item for item in old}
    after = {item[uuid_key]: item for item in new}
    changes = []
    for uuid, item in after.items():
        previous = before.get(uuid)
        if previous is None:
            changes.append(f"Added {noun} {_quoted(item, title_key)}")
        elif previous != item:
            fields = {key for key in item if item.get(key) != previous.get(key)}
            if fields == {"enabled"}:
                changes.append(f"Turned {'on' if item['enabled'] else 'off'} {noun} {_quoted(item, title_key)}")
            else:
                changes.append(f"Edited {noun} {_quoted(item, title_key)}")
    changes += [f"Removed {noun} {_quoted(item, title_key)}" for uuid, item in before.items() if uuid not in after]
    kept = [uuid for uuid in after if uuid in before]
    if kept != [uuid for uuid in before if uuid in after]:
        changes.append(f"Reordered {noun}s")
    return changes


def changes(old: dict | None, new: dict) -> list[str]:
    """What differs between two snapshots, in words an admin recognizes."""
    if old is None:
        return ["The first release"]
    found = []
    if (old.get("method") or "").strip() != (new.get("method") or "").strip():
        found.append("Edited the method")
    found += _list_changes(old.get("playbooks") or [], new.get("playbooks") or [], "playbook_uuid", "title", "playbook")
    found += _list_changes(old.get("routines") or [], new.get("routines") or [], "routine_uuid", "name", "routine")
    old_abilities, new_abilities = old.get("abilities") or {}, new.get("abilities") or {}
    for key, label in ABILITY_LABELS.items():
        was, now = old_abilities.get(key, True), new_abilities.get(key, True)
        if was != now:
            found.append(f"Turned {'on' if now else 'off'} “{label}”")
    old_tiers, new_tiers = old.get("tiers") or {}, new.get("tiers") or {}
    for tier in ("fast", "standard", "deep"):
        was, now = old_tiers.get(tier) or {}, new_tiers.get(tier) or {}
        if was != now:
            model = (now.get("model") or "").strip()
            found.append(f"{tier.capitalize()} now runs {model}" if model and model != was.get("model") else f"Changed the {tier.capitalize()} model settings")
    return found


def _live(db: Session) -> CoachRelease | None:
    policy = db.get(CoachPolicy, coach_policy.POLICY_ID)
    return db.get(CoachRelease, policy.live_release_id) if policy and policy.live_release_id else None


def summary(db: Session) -> dict:
    """For every tab's header: which release is live and what the draft changes."""
    live = _live(db)
    return {"live_number": live.number if live else None, "draft_changes": changes(live.snapshot if live else None, coach_policy.draft_snapshot(db))}


def _check_runnable(db: Session, policy: CoachPolicy, snapshot: dict) -> None:
    """A release must leave Coach able to run when it is on."""
    if not policy.enabled:
        return
    standard = (snapshot.get("tiers") or {}).get("standard") or {}
    keys = {key.key_uuid for key in coach_policy.list_keys(db)}
    if standard.get("key_uuid") not in keys or not (standard.get("model") or "").strip():
        raise HTTPException(status_code=422, detail="Coach is on, so this release needs a Standard key and model. Set them on the Model tab first.")


def _make_live(db: Session, current_user: PublicUser | None, snapshot: dict, note: str) -> CoachRelease:
    policy = db.get(CoachPolicy, coach_policy.POLICY_ID) or CoachPolicy(id=coach_policy.POLICY_ID, method=coach_policy.DEFAULT_METHOD)
    _check_runnable(db, policy, snapshot)
    live = _live(db)
    number = (db.exec(select(CoachRelease.number).order_by(CoachRelease.number.desc())).first() or 0) + 1  # type: ignore[attr-defined]
    release_row = CoachRelease(
        release_uuid=f"coach_release_{uuid4().hex}", number=number, snapshot=snapshot,
        changes=changes(live.snapshot if live else None, snapshot), note=note.strip(),
        released_by_user_id=current_user.id if current_user else None, released_at=datetime.utcnow(),
    )
    db.add(release_row)
    db.flush()
    policy.live_release_id = release_row.id
    db.add(policy)
    db.commit()
    db.refresh(release_row)
    return release_row


def release(db: Session, current_user: PublicUser | None, note: str = "") -> CoachRelease:
    """Freeze the draft into a new release and make it live."""
    snapshot = coach_policy.draft_snapshot(db)
    live = _live(db)
    if live is not None and not changes(live.snapshot, snapshot):
        raise HTTPException(status_code=422, detail=f"The draft is the same as release {live.number}.")
    return _make_live(db, current_user, snapshot, note)


def _find(db: Session, release_uuid: str) -> CoachRelease:
    found = db.exec(select(CoachRelease).where(CoachRelease.release_uuid == release_uuid)).first()
    if found is None:
        raise HTTPException(status_code=404, detail="Release not found.")
    return found


def roll_back(db: Session, current_user: PublicUser, release_uuid: str) -> CoachRelease:
    """Release an earlier version again. The draft stays as it is."""
    earlier = _find(db, release_uuid)
    live = _live(db)
    if live is not None and live.id == earlier.id:
        raise HTTPException(status_code=422, detail=f"Release {earlier.number} is already live.")
    return _make_live(db, current_user, dict(earlier.snapshot), f"Rolled back to release {earlier.number}")


def discard_draft(db: Session, current_user: PublicUser) -> None:
    """Put the draft back to the live release: method, abilities, models, playbooks and routines."""
    live = _live(db)
    if live is None:
        raise HTTPException(status_code=422, detail="There is no release to go back to yet.")
    snapshot, now = live.snapshot, datetime.utcnow()
    policy = db.get(CoachPolicy, coach_policy.POLICY_ID)
    assert policy is not None
    policy.method, policy.abilities, policy.tiers = snapshot.get("method") or "", dict(snapshot.get("abilities") or {}), dict(snapshot.get("tiers") or {})
    policy.updated_by_user_id, policy.updated_at = current_user.id, now
    db.add(policy)
    for model, uuid_key, fields, items in (
        (CoachPlaybook, "playbook_uuid", ("title", "used_when", "body", "always", "enabled"), snapshot.get("playbooks") or []),
        (CoachRoutine, "routine_uuid", ("name", "trigger", "instructions", "tier", "enabled"), snapshot.get("routines") or []),
    ):
        rows = {getattr(row, uuid_key): row for row in db.exec(select(model)).all()}
        wanted = {item[uuid_key] for item in items}
        for uuid, row in rows.items():
            if uuid not in wanted:
                db.delete(row)
        for position, item in enumerate(items):
            row = rows.get(item[uuid_key]) or model(**{uuid_key: item[uuid_key]}, created_at=now)
            for name in fields:
                setattr(row, name, item[name])
            row.position, row.updated_by_user_id, row.updated_at = position, current_user.id, now
            db.add(row)
    db.commit()


def _release_dict(row: CoachRelease, live_id: int | None, names: dict[int, str]) -> dict:
    return {
        "release_uuid": row.release_uuid, "number": row.number, "note": row.note, "changes": list(row.changes or []),
        "released_at": row.released_at, "released_by": names.get(row.released_by_user_id or 0, ""), "live": row.id == live_id,
    }


def releases_view(db: Session) -> dict:
    rows = list(db.exec(select(CoachRelease).order_by(CoachRelease.number.desc())).all())  # type: ignore[attr-defined]
    ids = {row.released_by_user_id for row in rows if row.released_by_user_id}
    users = db.exec(select(User).where(User.id.in_(ids))).all() if ids else []  # type: ignore[union-attr]
    names = {int(user.id): " ".join(part for part in (user.first_name, user.last_name) if part) or user.username for user in users if user.id}  # type: ignore[arg-type]
    live = _live(db)
    from src.services.coach import scenarios

    def tests(snapshot: dict) -> dict | None:
        """The newest finished test run on this exact snapshot, if there is one."""
        run = scenarios.latest_run(db, snapshot, finished=True)
        return scenarios.run_dict(run) if run else None

    return {
        **summary(db), "draft_tests": tests(coach_policy.draft_snapshot(db)),
        "releases": [{**_release_dict(row, live.id if live else None, names), "tests": tests(row.snapshot)} for row in rows],
    }
