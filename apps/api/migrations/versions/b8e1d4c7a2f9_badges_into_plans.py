"""badges into plans: a badge becomes the badge block of the plan that earns it, awards move to badge_award

Revision ID: b8e1d4c7a2f9
Revises: uc4d9e6f3a12

A badge is now an optional part of a plan (the ``badge`` block of its template
document, drafted and released with the plan), and ``badge_award`` holds what
learners earn. This revision moves every badge onto the plans that earned it:

- A badge goes onto each plan it had a route to, in every version of that plan
  and its draft. A plan that was a route to several badges keeps the oldest
  one; the others are reported and go onto a plan of their own.
- A badge left without a plan (no routes, or every route kept by an older badge)
  becomes a new plan with one empty stage and the badge block, published, so
  its awards and direct awards keep working. Staff add steps to it later.
- Awards move to ``badge_award`` against the badge's first plan, keeping the
  achievement as it was (name, image, criteria, version), one per learner.
- Learners' badge plans become plans they joined (``goal.source = 'joined'``),
  badge steps point at the plan with the badge (``goal_step.badge_template_id``,
  ``config.template_uuid``), and pending or accepted learner links become
  requests to join the plan (``plan_join_request``).
- Portfolio featured and hidden badges are keyed by award, Discover's badge
  slides become plan slides, and the ``review_badge_submissions`` capability is
  ``review_submissions``. Badge rights on roles and API tokens, and badges
  attached to groups and payment offers, go away.

Then the old tables and columns are dropped. Downgrade recreates nothing: a
real rollback restores the pre-release database backup.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import date, datetime
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "b8e1d4c7a2f9"
down_revision: Union[str, None] = "uc4d9e6f3a12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")

OLD_TABLES = (
    "badge_route_partner", "badgerouteoffer", "badgeroute", "badgeissuerlearnerlink", "badgeissuerauthorization",
    "learningbadgeaward", "learningbadgenotificationsignup", "learningbadgeversion", "learningbadge", "badgecollection",
)
KINDS = {
    "Badge": "Badge", "Achievement": "Badge", "Award": "Award", "Assessment": "Competency", "Competency": "Competency",
    "Certificate": "CertificateOfCompletion", "CertificateOfCompletion": "CertificateOfCompletion", "Course": "CertificateOfCompletion",
    "Certification": "Certification",
}
STYLES = {"modern": "modern", "minimal": "minimal", "professional": "classic", "academic": "classic", "royal": "classic", "vintage": "classic"}
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def _now() -> str:
    return datetime.now().isoformat()


def _json(value):
    if value is None:
        return None
    return value if isinstance(value, (dict, list)) else json.loads(value)


def _tables(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def _columns(bind, table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table)}


def _rows(bind, sql: str, **params) -> list[dict]:
    return [dict(row._mapping) for row in bind.execute(sa.text(sql), params)]


def _image(value: str | None) -> str:
    value = (value or "").strip()
    return value if value.startswith("https://") or value.startswith("/") else ""


# The new schema ------------------------------------------------------------------------------------------

def _create_tables() -> None:
    op.create_table(
        "badge_award",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("award_uuid", sa.String(), nullable=False),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("goal_template.id", ondelete="SET NULL"), nullable=True),
        sa.Column("version_id", sa.Integer(), sa.ForeignKey("goal_template_version.id", ondelete="SET NULL"), nullable=True),
        sa.Column("semver", sa.String(), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("issuing_org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creator_org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("goal_id", sa.Integer(), sa.ForeignKey("goal.id", ondelete="SET NULL"), nullable=True),
        sa.Column("awarded_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("statement", sa.String(), nullable=False, server_default=""),
        sa.Column("evidence_url", sa.String(), nullable=False, server_default=""),
        sa.Column("earned_on", sa.Date(), nullable=False),
        sa.Column("achievement", sa.JSON(), nullable=False),
        sa.Column("issued_at", sa.DateTime(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("award_uuid"),
        sa.UniqueConstraint("template_id", "user_id"),
    )
    for column in ("award_uuid", "template_id", "user_id", "issuing_org_id", "source"):
        op.create_index(f"ix_badge_award_{column}", "badge_award", [column])
    op.create_table(
        "plan_join_request",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_uuid", sa.String(), nullable=False),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("goal_template.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=False, server_default=""),
        sa.Column("decided_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("goal_id", sa.Integer(), sa.ForeignKey("goal.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("request_uuid"),
        sa.UniqueConstraint("template_id", "org_id", "user_id"),
    )
    for column in ("request_uuid", "template_id", "org_id", "user_id", "status"):
        op.create_index(f"ix_plan_join_request_{column}", "plan_join_request", [column])
    op.add_column("goal_step", sa.Column("badge_template_id", sa.Integer(), nullable=True))
    op.create_foreign_key("goal_step_badge_template_id_fkey", "goal_step", "goal_template", ["badge_template_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_goal_step_badge_template_id", "goal_step", ["badge_template_id"])


# Badges onto plans ----------------------------------------------------------------------------------------

class Move:
    """Everything the data move works out, with what it reports."""

    def __init__(self, bind):
        self.bind = bind
        self.badges: dict[int, dict] = {}
        self.plans_of: dict[int, list[int]] = {}       # badge id -> template ids it is on
        self.uuid_of_template: dict[int, str] = {}
        self.warnings: list[str] = []
        self.counts = {"badges": 0, "plans_given_badges": 0, "new_plans": 0, "awards": 0, "join_requests": 0}

    # Reading the old badges --------------------------------------------------------------------------

    def load(self) -> None:
        badges = _rows(self.bind, "SELECT * FROM learningbadge WHERE deleted_at IS NULL ORDER BY id")
        versions = {row["id"]: row for row in _rows(self.bind, "SELECT id, badge_id, state, semantic_version, definition FROM learningbadgeversion")}
        newest: dict[int, dict] = {}
        for version in sorted(versions.values(), key=lambda row: row["id"]):
            newest[version["badge_id"]] = version
        for badge in badges:
            version = versions.get(badge["active_version_id"]) or newest.get(badge["id"])
            definition = _json(version["definition"]) if version and version.get("definition") else {}
            definition = definition or {}
            metadata = _json(definition.get("badge_metadata")) or _json(badge.get("metadata")) or {}
            self.badges[badge["id"]] = {
                **badge,
                "name": (definition.get("name") or badge["name"] or "").strip(),
                "description": (definition.get("description") or badge.get("description") or "").strip(),
                "criteria": (definition.get("criteria") or badge.get("criteria") or "").strip(),
                "image": _image(definition.get("thumbnail_image") or metadata.get("badge_image_url") or badge.get("thumbnail_image")),
                "kind": KINDS.get(str(metadata.get("achievement_type") or ""), "Badge"),
                "style": STYLES.get(str(metadata.get("badge_theme") or metadata.get("certificate_pattern") or ""), "modern"),
                "semver": version["semantic_version"] if version and version.get("semantic_version") else None,
            }
        self.counts["badges"] = len(self.badges)

    def assign(self) -> None:
        """Each plan keeps the oldest badge routed to it; each badge goes on every plan it keeps."""
        routes = _rows(self.bind, "SELECT badge_id, goal_template_id FROM badgeroute ORDER BY recommended DESC, position, id")
        kept: dict[int, int] = {}
        for route in sorted(routes, key=lambda row: row["badge_id"]):
            if route["badge_id"] not in self.badges:
                continue
            template_id = route["goal_template_id"]
            if template_id not in kept:
                kept[template_id] = route["badge_id"]
            elif kept[template_id] != route["badge_id"]:
                self.warnings.append(
                    f"plan {template_id} earned several badges; it keeps badge {kept[template_id]} instead of badge {route['badge_id']}"
                )
        for route in routes:  # recommended route first, so a badge's first plan is the one learners started
            if kept.get(route["goal_template_id"]) == route["badge_id"] and route["goal_template_id"] not in self.plans_of.get(route["badge_id"], []):
                self.plans_of.setdefault(route["badge_id"], []).append(route["goal_template_id"])

    # Writing the badge block --------------------------------------------------------------------------

    def block(self, badge: dict, template: dict) -> dict:
        return {
            "kind": badge["kind"], "skills": [], "style": badge["style"],
            "name": badge["name"] if badge["name"] and badge["name"] != template["title"] else "",
            "image_url": badge["image"] if badge["image"] and badge["image"] != (template.get("thumbnail_image") or "") else "",
            "human_code": "", "field_of_study": "", "specialization": "", "credits_available": None, "in_language": "",
        }

    def put_on_plans(self) -> None:
        fingerprints = _Fingerprints(self.bind)
        for badge_id, template_ids in self.plans_of.items():
            badge = self.badges[badge_id]
            for template_id in template_ids:
                template = _rows(self.bind, "SELECT id, template_uuid, title, thumbnail_image, document, published_version_id FROM goal_template WHERE id = :id", id=template_id)[0]
                in_sync = fingerprints.in_sync(template)
                block = self.block(badge, template)
                document = _json(template["document"]) or {}
                self.bind.execute(sa.text("UPDATE goal_template SET document = :document WHERE id = :id"),
                                  {"document": json.dumps({**document, "badge": block}), "id": template_id})
                for version in _rows(self.bind, "SELECT id, document FROM goal_template_version WHERE template_id = :id", id=template_id):
                    self.bind.execute(sa.text("UPDATE goal_template_version SET document = :document WHERE id = :id"),
                                      {"document": json.dumps({**(_json(version["document"]) or {}), "badge": block}), "id": version["id"]})
                if in_sync:
                    fingerprints.resync(template_id)
                self.uuid_of_template[template_id] = template["template_uuid"]
                self.counts["plans_given_badges"] += 1

    def new_plans(self) -> None:
        """A plan of its own, with one empty stage, for each badge left without one."""
        from src.services.goals.document import empty_document

        for badge_id, badge in self.badges.items():
            if self.plans_of.get(badge_id):
                continue
            now = _now()
            template = {"title": badge["name"] or "Badge", "thumbnail_image": badge["image"]}
            document = empty_document(template["title"], badge["description"])
            document["stages"][0]["title"] = "Earn it"
            document["badge"] = {**self.block(badge, template), "name": "", "image_url": ""}
            template_uuid = f"goal_template_{uuid4()}"
            template_id = self.bind.execute(sa.text(
                "INSERT INTO goal_template (template_uuid, org_id, title, description, thumbnail_image, icon, color, status, document, "
                "creation_date, update_date) VALUES (:uuid, :org, :title, :description, :image, 'star', NULL, 'active', :document, :now, :now) RETURNING id"
            ), {"uuid": template_uuid, "org": badge["org_id"], "title": template["title"], "description": badge["description"],
                "image": badge["image"], "document": json.dumps(document), "now": now}).scalar_one()
            semver = badge["semver"] if badge["semver"] and SEMVER.match(badge["semver"]) else "1.0.0"
            version_id = self.bind.execute(sa.text(
                "INSERT INTO goal_template_version (version_uuid, template_id, org_id, number, semver, document, content_hash, note, private, published_at, creation_date) "
                "VALUES (:uuid, :template, :org, 1, :semver, :document, :hash, 'Made from a badge', false, :at, :now) RETURNING id"
            ), {"uuid": f"goal_template_version_{uuid4()}", "template": template_id, "org": badge["org_id"], "semver": semver,
                "document": json.dumps(document), "hash": _content_hash(document), "at": datetime.utcnow(), "now": now}).scalar_one()
            self.bind.execute(sa.text("UPDATE goal_template SET published_version_id = :version WHERE id = :id"), {"version": version_id, "id": template_id})
            self.plans_of[badge_id] = [template_id]
            self.uuid_of_template[template_id] = template_uuid
            self.counts["new_plans"] += 1

    # Awards --------------------------------------------------------------------------------------------

    def achievement(self, badge: dict, template_id: int, semver: str | None) -> dict:
        template = _rows(self.bind, "SELECT template_uuid, title, description, thumbnail_image, icon, color FROM goal_template WHERE id = :id", id=template_id)[0]
        org = _rows(self.bind, "SELECT id, org_uuid, slug, name, logo_image FROM organization WHERE id = :id", id=badge["org_id"])
        return {
            "template_uuid": template["template_uuid"], "name": badge["name"] or template["title"],
            "description": badge["description"] or template["description"] or "", "image_url": badge["image"] or template["thumbnail_image"] or "",
            "icon": template["icon"], "color": template["color"], "kind": badge["kind"], "skills": [], "style": badge["style"],
            "criteria_narrative": badge["criteria"], "alignment": [], "creator": org[0] if org else None, "version": semver,
        }

    def awards(self) -> dict[tuple[int, int], str]:
        """Move awards; returns (badge id, user id) -> award uuid."""
        semvers = {row["id"]: row["semantic_version"] for row in _rows(self.bind, "SELECT id, semantic_version FROM learningbadgeversion")}
        result: dict[tuple[int, int], str] = {}
        for award in _rows(self.bind, "SELECT * FROM learningbadgeaward ORDER BY issued_at, id"):
            badge = self.badges.get(award["badge_id"])
            if badge is None or (award["badge_id"], award["user_id"]) in result:
                continue
            template_id = self.plans_of[award["badge_id"]][0]
            semver = semvers.get(award["badge_version_id"]) or badge["semver"]
            evidence = _json(award.get("evidence")) or {}
            direct = str(award["source"]).lower().endswith("direct_conferral")
            issued = award["issued_at"] if isinstance(award["issued_at"], datetime) else datetime.fromisoformat(str(award["issued_at"]))
            award_uuid = award["award_uuid"] or f"award_{uuid4()}"
            self.bind.execute(sa.text(
                "INSERT INTO badge_award (award_uuid, template_id, version_id, semver, user_id, issuing_org_id, creator_org_id, source, goal_id, "
                "awarded_by_user_id, statement, evidence_url, earned_on, achievement, issued_at, creation_date, update_date) VALUES "
                "(:uuid, :template, NULL, :semver, :user, :issuer, :creator, :source, NULL, :by, :statement, :url, :earned, :achievement, :issued, :created, :updated)"
            ), {
                "uuid": award_uuid, "template": template_id, "semver": semver, "user": award["user_id"],
                "issuer": award["issuing_org_id"] or badge["org_id"], "creator": badge["org_id"],
                "source": "direct_award" if direct else "plan_completion", "by": award["conferred_by_user_id"],
                "statement": str(evidence.get("narrative") or evidence.get("description") or evidence.get("statement") or "") if direct else "",
                "url": str(evidence.get("id") or evidence.get("url") or "") if direct else "",
                "earned": issued.date() if isinstance(issued, datetime) else date.today(),
                "achievement": json.dumps(self.achievement(badge, template_id, semver)), "issued": issued,
                "created": award["creation_date"] or _now(), "updated": _now(),
            })
            result[(award["badge_id"], award["user_id"])] = award_uuid
            self.counts["awards"] += 1
        return result

    # What pointed at badges --------------------------------------------------------------------------

    def goals_and_steps(self) -> None:
        self.bind.execute(sa.text("UPDATE goal SET source = 'joined' WHERE source = 'badge'"))
        first = {badge_id: template_ids[0] for badge_id, template_ids in self.plans_of.items()}
        uuid_of_badge = {badge["badge_uuid"]: badge_id for badge_id, badge in self.badges.items()}
        for step in _rows(self.bind, "SELECT id, badge_id, config FROM goal_step WHERE badge_id IS NOT NULL OR type = 'badge'"):
            config = _json(step["config"]) or {}
            badge_id = step["badge_id"] or uuid_of_badge.get(config.get("badge_uuid"))
            template_id = first.get(badge_id)
            config = {"template_uuid": self.uuid_of_template[template_id]} if template_id else {}
            self.bind.execute(sa.text("UPDATE goal_step SET badge_template_id = :template, config = :config WHERE id = :id"),
                              {"template": template_id, "config": json.dumps(config), "id": step["id"]})
        # Badge steps in plan documents (drafts, versions and library copies).
        for table, columns in (("goal_template", ("document", "library_document")), ("goal_template_version", ("document",))):
            for row in _rows(self.bind, f"SELECT id, {', '.join(columns)} FROM {table}"):
                for column in columns:
                    document = _json(row[column])
                    if not document or "badge_uuid" not in json.dumps(document):
                        continue
                    for stage in document.get("stages") or []:
                        for step in stage.get("steps") or []:
                            if step.get("type") == "badge":
                                template_id = first.get(uuid_of_badge.get((step.get("config") or {}).get("badge_uuid")))
                                step["config"] = {"template_uuid": self.uuid_of_template[template_id]} if template_id else {"template_uuid": ""}
                    self.bind.execute(sa.text(f"UPDATE {table} SET {column} = :document WHERE id = :id"), {"document": json.dumps(document), "id": row["id"]})

    def join_requests(self) -> None:
        statuses = {"requested": "requested", "accepted": "accepted", "completed": "accepted", "rejected": "rejected"}
        seen: set[tuple[int, int, int]] = set()
        for link in _rows(self.bind, "SELECT * FROM badgeissuerlearnerlink ORDER BY id DESC"):
            status = statuses.get(link["status"])
            template_ids = self.plans_of.get(link["badge_id"])
            if status is None or not template_ids:
                continue
            key = (template_ids[0], link["issuer_org_id"], link["user_id"])
            if key in seen:
                continue
            seen.add(key)
            self.bind.execute(sa.text(
                "INSERT INTO plan_join_request (request_uuid, template_id, org_id, user_id, status, message, decided_by_user_id, decided_at, "
                "creation_date, update_date) VALUES (:uuid, :template, :org, :user, :status, :message, :by, :at, :created, :updated)"
            ), {"uuid": f"plan_join_{uuid4()}", "template": key[0], "org": key[1], "user": key[2], "status": status,
                "message": link.get("message") or "", "by": link.get("decided_by_user_id"), "at": link.get("decided_at"),
                "created": link.get("creation_date") or _now(), "updated": _now()})
            self.counts["join_requests"] += 1

    def portfolios(self, awards: dict[tuple[int, int], str]) -> None:
        uuid_of_badge = {badge["badge_uuid"]: badge_id for badge_id, badge in self.badges.items()}
        for row in _rows(self.bind, "SELECT id, user_id, theme_settings FROM portfolio"):
            settings = _json(row["theme_settings"]) or {}
            if not any(key in settings for key in ("featured_badge_uuids", "hidden_badge_uuids")):
                continue

            def awarded(badge_uuids) -> list[str]:
                found = [awards.get((uuid_of_badge.get(item), row["user_id"])) for item in badge_uuids or []]
                return [item for item in found if item]

            settings["featured_award_uuids"] = awarded(settings.pop("featured_badge_uuids", []))
            settings["hidden_award_uuids"] = awarded(settings.pop("hidden_badge_uuids", []))
            self.bind.execute(sa.text("UPDATE portfolio SET theme_settings = :settings WHERE id = :id"), {"settings": json.dumps(settings), "id": row["id"]})

    def discover_slides(self) -> None:
        first = {badge["badge_uuid"]: self.uuid_of_template[self.plans_of[badge_id][0]] for badge_id, badge in self.badges.items()}
        for row in _rows(self.bind, "SELECT id, config FROM organizationconfig"):
            config = _json(row["config"]) or {}
            discover = (config.get("customization") or {}).get("discover") if isinstance(config.get("customization"), dict) else None
            if not isinstance(discover, dict) or not isinstance(discover.get("slides"), list):
                continue
            slides = []
            for slide in discover["slides"]:
                if not isinstance(slide, dict):
                    continue
                if slide.get("kind") == "badge":
                    if slide.get("target") in first:
                        slides.append({**slide, "kind": "plan", "target": first[slide["target"]]})
                elif slide.get("kind") != "collection":  # badge collections are gone
                    slides.append(slide)
            discover["slides"] = slides
            self.bind.execute(sa.text("UPDATE organizationconfig SET config = :config WHERE id = :id"), {"config": json.dumps(config), "id": row["id"]})


class _Fingerprints:
    """Keeps a plan's live version matching its draft (no "unpublished changes") when both get the badge.
    Uses the app's own fingerprint; when that can't run, the plan just shows a change to publish."""

    def __init__(self, bind):
        self.session = None
        try:
            from sqlmodel import Session

            from src.services.goals.templates import fingerprint

            self.session, self.fingerprint = Session(bind=bind), fingerprint
        except Exception as error:  # pragma: no cover - drift in later releases
            log.warning("badges into plans: fingerprints unavailable (%s)", error)

    def _draft(self, template_id: int):
        from types import SimpleNamespace

        row = _rows(self.session.connection(), "SELECT document FROM goal_template WHERE id = :id", id=template_id)[0]  # type: ignore[union-attr]
        return SimpleNamespace(document=_json(row["document"]) or {})

    def in_sync(self, template: dict) -> bool:
        if self.session is None or not template["published_version_id"]:
            return False
        try:
            live = _rows(self.session.connection(), "SELECT content_hash FROM goal_template_version WHERE id = :id", id=template["published_version_id"])
            return bool(live) and live[0]["content_hash"] == self.fingerprint(self.session, self._draft(template["id"]))
        except Exception as error:  # pragma: no cover
            log.warning("badges into plans: fingerprint failed (%s)", error)
            self.session = None
            return False

    def resync(self, template_id: int) -> None:
        if self.session is None:
            return
        value = self.fingerprint(self.session, self._draft(template_id))
        self.session.connection().execute(sa.text(
            "UPDATE goal_template_version SET content_hash = :hash WHERE id = (SELECT published_version_id FROM goal_template WHERE id = :id)"
        ), {"hash": value, "id": template_id})


def _content_hash(document: dict) -> str:
    try:
        from src.services.learning.activity_copy import content_hash

        return content_hash(document)
    except Exception:  # pragma: no cover
        return hashlib.sha256(json.dumps(document, sort_keys=True).encode()).hexdigest()


# Leftovers that named badges -----------------------------------------------------------------------------

def _rename_capability(bind) -> None:
    targets = (("planrole", ("capabilities",)), ("organizationplanrole", ("capabilities",)),
               ("goal_template", ("document", "library_document")), ("goal_template_version", ("document",)))
    tables = _tables(bind)
    for table, columns in targets:
        if table not in tables:
            continue
        for row in _rows(bind, f"SELECT id, {', '.join(columns)} FROM {table}"):
            for column in columns:
                text = json.dumps(_json(row[column])) if row[column] is not None else ""
                if "review_badge_submissions" in text:
                    bind.execute(sa.text(f"UPDATE {table} SET {column} = :value WHERE id = :id"),
                                 {"value": text.replace("review_badge_submissions", "review_submissions"), "id": row["id"]})


def _drop_badge_rights(bind) -> None:
    for table in ("role", "apitoken"):
        if table not in _tables(bind):
            continue
        for row in _rows(bind, f"SELECT id, rights FROM {table} WHERE rights IS NOT NULL"):
            rights = _json(row["rights"])
            if isinstance(rights, dict) and ({"badges", "badge_collections"} & set(rights)):
                rights = {key: value for key, value in rights.items() if key not in ("badges", "badge_collections")}
                bind.execute(sa.text(f"UPDATE {table} SET rights = :rights WHERE id = :id"), {"rights": json.dumps(rights), "id": row["id"]})
    for table in ("usergroupresource", "paymentsofferresource", "paymentsgroupresource"):
        if table in _tables(bind):
            bind.execute(sa.text(f"DELETE FROM {table} WHERE resource_uuid LIKE 'badge%'"))


def _drop_old(bind) -> None:
    for table, column in (("goal_step", "badge_id"), ("goal", "badge_id"), ("goal_assignment", "badge_id")):
        if column in _columns(bind, table):
            for fk in sa.inspect(bind).get_foreign_keys(table):
                if fk["constrained_columns"] == [column] and fk.get("name"):
                    op.drop_constraint(fk["name"], table, type_="foreignkey")
            for index in sa.inspect(bind).get_indexes(table):
                if index["column_names"] == [column]:
                    op.drop_index(index["name"], table_name=table)
            op.drop_column(table, column)
    existing = _tables(bind)
    for table in OLD_TABLES:
        if table in existing:
            op.execute(sa.text(f'DROP TABLE "{table}" CASCADE'))
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("DROP TYPE IF EXISTS learningawardsource"))


def upgrade() -> None:
    bind = op.get_bind()
    _create_tables()
    if "learningbadge" in _tables(bind):
        move = Move(bind)
        move.load()
        move.assign()
        move.put_on_plans()
        move.new_plans()
        awards = move.awards()
        move.goals_and_steps()
        if "badgeissuerlearnerlink" in _tables(bind):
            move.join_requests()
        move.portfolios(awards)
        move.discover_slides()
        log.info("Badges into plans: %s", ", ".join(f"{key} {value}" for key, value in move.counts.items()))
        for warning in move.warnings:
            log.warning("badges into plans: %s", warning)
    _rename_capability(bind)
    _drop_badge_rights(bind)
    _drop_old(bind)


def downgrade() -> None:
    raise RuntimeError("Badges into plans can't be undone in place; restore the pre-release database backup.")
