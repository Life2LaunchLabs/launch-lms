"""Policy-driven FEED intake and deterministic BOT milestone projection."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from jira_rest import JiraClient, JiraError, adf, adf_text, summarize

TRIAGE_PROPERTY = "launchlms.feedback-triage"
PUBLIC_PREFIX = "[Launch LMS reply]"
INTERNAL_PREFIX = "[Launch LMS internal note]"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def note_prefix(policy: dict, audience: str) -> str:
    defaults = {"public_reply_prefix": PUBLIC_PREFIX, "internal_note_prefix": INTERNAL_PREFIX}
    return str((policy.get("communication") or {}).get(audience, defaults[audience]))


def load_policy(path: Path) -> dict:
    value: dict = {}
    stack: list[tuple[int, dict]] = [(-1, value)]
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        if indent % 2:
            raise JiraError(f"Feedback policy line {number} has uneven indentation")
        key, separator, source = raw.strip().partition(":")
        if not separator or not key:
            raise JiraError(f"Feedback policy line {number} is not a mapping entry")
        while indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        source = source.strip()
        if not source:
            parent[key] = {}
            stack.append((indent, parent[key]))
        else:
            parent[key] = policy_scalar(source)
    if not isinstance(value, dict) or value.get("schema_version") != 2:
        raise JiraError("Feedback policy schema_version must be 2")
    for key in ("tracker", "triage", "workflow", "automation", "resolution"):
        if not isinstance(value.get(key), dict):
            raise JiraError(f"Feedback policy is missing {key}")
    return value


def policy_scalar(source: str):
    if source.startswith("[") and source.endswith("]"):
        body = source[1:-1].strip()
        return [policy_scalar(item.strip()) for item in body.split(",")] if body else []
    if source in {"true", "false"}:
        return source == "true"
    if source.isdigit():
        return int(source)
    if source.startswith('"') and source.endswith('"'):
        return json.loads(source)
    return source


def slug(value: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    if not result:
        raise JiraError("Concept needs at least one letter or number")
    return result


def status_catalog(client: JiraClient) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {}
    for group in client.statuses():
        for status in group.get("statuses") or []:
            result.setdefault(str(status.get("name", "")).casefold(), []).append(status)
    return result


def resolve_roles(client: JiraClient, roles: dict[str, list[str]]) -> dict[str, dict]:
    catalog = status_catalog(client)
    result = {}
    for role, candidates in roles.items():
        matches = [status for name in candidates for status in catalog.get(str(name).casefold(), [])]
        unique = {str(item.get("id")): item for item in matches if item.get("id")}
        if len(unique) != 1:
            raise JiraError(f"Jira status role {role!r} resolved to {len(unique)} statuses; configure exactly one")
        result[role] = next(iter(unique.values()))
    return result


def validate_delivery_roles(client: JiraClient, roles: dict[str, list[str]]) -> dict[str, list[dict]]:
    catalog = status_catalog(client)
    result = {}
    for role, names in roles.items():
        statuses = []
        for name in names:
            matches = {str(item.get("id")): item for item in catalog.get(str(name).casefold(), []) if item.get("id")}
            if len(matches) != 1:
                raise JiraError(f"Jira delivery status {name!r} for role {role!r} resolved to {len(matches)} statuses")
            statuses.append(next(iter(matches.values())))
        result[role] = statuses
    return result


def feedback_issues(client: JiraClient, policy: dict) -> list[dict]:
    project = policy["tracker"]["feedback_project"].replace('"', '\\"')
    return client.search(f'project = "{project}" AND labels = "launchlms-feedback" ORDER BY created ASC')


def linked_bot_keys(issue: dict, delivery_project: str) -> list[str]:
    result = []
    for link in (issue.get("fields") or {}).get("issuelinks") or []:
        other = link.get("outwardIssue") or link.get("inwardIssue") or {}
        key = str(other.get("key", ""))
        if key.startswith(delivery_project + "-"):
            result.append(key)
    pattern = re.compile(rf"\b{re.escape(delivery_project)}-\d+\b")
    for comment in ((issue.get("fields") or {}).get("comment") or {}).get("comments") or []:
        result.extend(pattern.findall(adf_text(comment.get("body"))))
    return list(dict.fromkeys(result))


def issue_status(issue: dict) -> str:
    return str(((issue.get("fields") or {}).get("status") or {}).get("name", ""))


def legacy_metadata(issue: dict) -> dict:
    evaluations = []
    notified_stage = "intake"
    for comment in summarize(issue)["comments"]:
        body = comment["body"]
        match = re.search(
            r"Triage: concept=([^;]+); impact=([1-5])/5; decision=([^;]+); rationale=(.+)",
            body,
        )
        if match:
            evaluations.append({
                "concept": match.group(1).strip(), "title": match.group(1).strip().replace("-", " ").title(),
                "impact": int(match.group(2)), "decision": match.group(3).strip(),
                "rationale": match.group(4).strip(), "evaluated_at": comment.get("created"),
            })
        if "Work related to your feedback is now in progress" in body:
            notified_stage = "active"
        if "ready for you to test" in body or "related work has been published" in body:
            notified_stage = "ready_to_test"
    return {"schema_version": 1, "evaluations": evaluations, "notified_stage": notified_stage, "legacy_import": True}


def delivery_stage(statuses: list[str], roles: dict[str, list[str]]) -> str:
    normalized = {value.casefold() for value in statuses}
    ready = {value.casefold() for value in roles["ready_to_test"]}
    active = {value.casefold() for value in roles["active"]}
    if statuses and normalized <= ready:
        return "ready_to_test"
    if normalized & (active | ready):
        return "active"
    return "intake"


def audit(feed: JiraClient, bot: JiraClient, policy: dict) -> dict:
    items, concepts = [], {}
    for raw in feedback_issues(feed, policy):
        item = summarize(raw)
        stored = feed.property(item["key"], TRIAGE_PROPERTY)
        metadata = stored or legacy_metadata(raw)
        evaluations = metadata.get("evaluations") or []
        links = linked_bot_keys(raw, policy["tracker"]["delivery_project"])
        for evaluation in evaluations:
            concept = concepts.setdefault(evaluation["concept"], {
                "concept": evaluation["concept"], "title": evaluation.get("title") or evaluation["concept"],
                "impact": 0, "feedback": [], "bot": [], "oldest": item.get("created"),
            })
            concept["impact"] = max(concept["impact"], int(evaluation.get("impact", 1)))
            concept["feedback"].append(item["key"])
            concept["bot"] = list(dict.fromkeys(concept["bot"] + links))
            concept["oldest"] = min(concept["oldest"] or item.get("created"), item.get("created") or concept["oldest"])
        items.append({
            "key": item["key"], "summary": item["summary"], "status": item["status"],
            "priority": item["priority"], "created": item["created"], "labels": item["labels"],
            "triaged": bool(evaluations), "evaluations": evaluations, "linked_bot": links,
            "migration_needed": not bool(stored) and bool(evaluations or links),
            "comment_count": len(item["comments"]), "attachment_count": len(item["attachments"]),
        })
    ranked = sorted(concepts.values(), key=lambda value: (-value["impact"], -len(value["feedback"]), value["oldest"] or "", value["concept"]))
    return {"generated_at": now(), "items": items, "untriaged": [item for item in items if not item["triaged"]], "concepts": ranked}


def transition_if_needed(client: JiraClient, issue: dict, target: dict, apply: bool) -> bool:
    current = str(((issue.get("fields") or {}).get("status") or {}).get("id", ""))
    if current == str(target["id"]):
        return False
    if apply:
        client.transition(issue["key"], str(target["id"]))
    return True


def triage(
    feed: JiraClient, policy: dict, key: str, concept: str, title: str, impact: int,
    decision: str, rationale: str, public_note: str, apply: bool,
) -> dict:
    if decision not in policy["triage"]["decisions"]:
        raise JiraError(f"Unsupported feedback decision: {decision}")
    issue = feed.issue(key)
    metadata = feed.property(key, TRIAGE_PROPERTY)
    evaluations = [item for item in metadata.get("evaluations", []) if item.get("concept") != concept]
    evaluations.append({
        "concept": concept, "title": title, "impact": impact, "decision": decision,
        "rationale": rationale, "evaluated_at": now(),
    })
    role_name = policy["workflow"]["decision_targets"][decision]
    roles = resolve_roles(feed, policy["workflow"]["feedback_status_roles"])
    moved = str(((issue.get("fields") or {}).get("status") or {}).get("id", "")) != str(roles[role_name]["id"])
    if moved and not public_note.strip():
        raise JiraError("A public note is required when intake moves feedback to a new lifecycle state")
    labels = list((issue.get("fields") or {}).get("labels") or [])
    labels = [item for item in labels if not item.startswith(("feedback-concept-", "feedback-decision-"))]
    labels += [f"feedback-concept-{item['concept']}" for item in evaluations]
    labels += [f"feedback-decision-{item['decision']}" for item in evaluations]
    if apply:
        feed.set_property(key, TRIAGE_PROPERTY, {**metadata, "schema_version": 1, "evaluations": evaluations, "triaged_at": now()})
        feed.update(key, {"labels": sorted(set(labels))})
        feed.comment(key, f"{note_prefix(policy, 'internal_note_prefix')} Triage: concept={concept}; impact={impact}/5; decision={decision}; rationale={rationale}")
        if moved:
            feed.transition(key, str(roles[role_name]["id"]))
            feed.comment(key, f"{note_prefix(policy, 'public_reply_prefix')} {public_note.strip()}")
    return {"issue": key, "concept": concept, "decision": decision, "target_role": role_name, "would_move": moved, "applied": apply}


def already_linked(issue: dict, target: str) -> bool:
    return target in linked_bot_keys(issue, target.split("-", 1)[0])


def link_feedback(feed: JiraClient, policy: dict, feed_key: str, bot_key: str, apply: bool) -> dict:
    issue = feed.issue(feed_key)
    exists = already_linked(issue, bot_key)
    if apply and not exists:
        feed.link(feed_key, bot_key, policy["tracker"]["link_type"])
    return {"feedback": feed_key, "delivery": bot_key, "already_linked": exists, "applied": apply and not exists}


def migrate_legacy(feed: JiraClient, bot: JiraClient, policy: dict, apply: bool) -> list[dict]:
    results = []
    for raw in feedback_issues(feed, policy):
        key = raw["key"]
        stored = feed.property(key, TRIAGE_PROPERTY)
        metadata = stored or legacy_metadata(raw)
        bot_keys = linked_bot_keys(raw, policy["tracker"]["delivery_project"])
        native = {
            str((link.get("outwardIssue") or link.get("inwardIssue") or {}).get("key", ""))
            for link in (raw.get("fields") or {}).get("issuelinks") or []
        }
        missing_links = [bot_key for bot_key in bot_keys if bot_key not in native]
        needs_property = not bool(stored) and bool(metadata.get("evaluations") or bot_keys)
        if not needs_property and not missing_links:
            continue
        if apply:
            if needs_property:
                feed.set_property(key, TRIAGE_PROPERTY, {**metadata, "migrated_at": now()})
            for bot_key in missing_links:
                feed.link(key, bot_key, policy["tracker"]["link_type"])
        results.append({"feedback": key, "property": needs_property, "native_links": missing_links, "applied": apply})
    return results


def reconcile(feed: JiraClient, bot: JiraClient, policy: dict, apply: bool) -> list[dict]:
    roles = resolve_roles(feed, policy["workflow"]["feedback_status_roles"])
    delivery_roles = policy["workflow"]["delivery_status_roles"]
    confirmed = policy["resolution"]["confirmed_label"]
    reopened = policy["resolution"]["reopened_label"]
    results = []
    for raw in feedback_issues(feed, policy):
        fields = raw.get("fields") or {}
        labels = set(fields.get("labels") or [])
        bot_keys = linked_bot_keys(raw, policy["tracker"]["delivery_project"])
        if not bot_keys or confirmed in labels:
            continue
        bot_issues = [bot.issue(key) for key in bot_keys]
        stage = delivery_stage([issue_status(item) for item in bot_issues], delivery_roles)
        metadata = feed.property(raw["key"], TRIAGE_PROPERTY)
        if reopened in labels:
            if stage == "ready_to_test":
                continue
            target = roles["active" if stage == "active" else "intake"]
            moved = str((fields.get("status") or {}).get("id", "")) != str(target["id"])
            if apply:
                if moved:
                    feed.transition(raw["key"], str(target["id"]))
                feed.update(raw["key"], {"labels": sorted(labels - {reopened})})
                feed.set_property(raw["key"], TRIAGE_PROPERTY, {
                    **metadata, "notified_stage": stage, "reopened_reset_at": now(),
                    "bot_statuses": {item["key"]: issue_status(item) for item in bot_issues},
                })
            results.append({"feedback": raw["key"], "bot": bot_keys, "stage": stage, "reopened_reset": True, "would_move": moved, "applied": apply})
            continue
        target = roles["ready_to_test" if stage == "ready_to_test" else "active" if stage == "active" else "intake"]
        previous = metadata.get("notified_stage", "intake")
        order = {"intake": 0, "active": 1, "ready_to_test": 2}
        if order[stage] <= order.get(previous, 0):
            continue
        moved = str((fields.get("status") or {}).get("id", "")) != str(target["id"])
        if apply:
            if moved:
                feed.transition(raw["key"], str(target["id"]))
            if stage == "ready_to_test":
                feed.comment(raw["key"], f'{note_prefix(policy, "public_reply_prefix")} {policy["automation"]["completion_message"]}')
            feed.set_property(raw["key"], TRIAGE_PROPERTY, {
                **metadata, "notified_stage": stage, "notified_at": now(),
                "bot_statuses": {item["key"]: issue_status(item) for item in bot_issues},
            })
        results.append({"feedback": raw["key"], "bot": bot_keys, "stage": stage, "would_move": moved, "applied": apply})
    return results


def story_description(outcome: str, context: str, build_notes: str, tests: list[str]) -> str:
    scenarios = "\n".join(f"* {item}" for item in tests)
    return f"h2. Outcome\n\n{outcome}\n\nh2. Context\n\n{context}\n\nh2. Build notes\n\n{build_notes or 'None.'}\n\nh2. Owner test scenarios\n\n{scenarios}"


def create_work(
    feed: JiraClient, bot: JiraClient, policy: dict, concept: str, summary: str,
    outcome: str, context: str, build_notes: str, tests: list[str], deliverables: list[str],
    priority: str, apply: bool,
) -> dict:
    report = audit(feed, bot, policy)
    group = next((item for item in report["concepts"] if item["concept"] == concept), None)
    if not group:
        raise JiraError(f"Unknown feedback concept: {concept}")
    sources = "\n".join(f"* {key}" for key in group["feedback"])
    fields = {
        "project": {"key": policy["tracker"]["delivery_project"]},
        "issuetype": {"name": policy["tracker"]["delivery_issue_type"]},
        "summary": summary,
        "description": adf(story_description(outcome, context + "\n\nFeedback sources:\n" + sources, build_notes, tests)),
        "priority": {"name": priority}, "labels": [f"feedback-concept-{concept}"],
    }
    if not apply:
        return {"concept": concept, "feedback": group["feedback"], "fields": fields, "deliverables": deliverables, "applied": False}
    key = bot.create(fields)
    subtasks = [bot.create({
        "project": {"key": policy["tracker"]["delivery_project"]},
        "parent": {"key": key}, "issuetype": {"name": policy["tracker"]["delivery_subtask_type"]},
        "summary": item, "priority": {"name": priority},
    }) for item in deliverables]
    for feed_key in group["feedback"]:
        feed.link(feed_key, key, policy["tracker"]["link_type"])
    return {"concept": concept, "feedback": group["feedback"], "delivery": key, "subtasks": subtasks, "applied": True}
