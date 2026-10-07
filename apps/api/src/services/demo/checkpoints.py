"""Export the designated learner and connected content using explicit policies.

Unknown tables are empty, rather than implicitly exporting new private features.
Foreign-key closure follows parents; children require an approved content policy.
"""

from base64 import b64encode
from datetime import date, datetime
from enum import Enum

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlmodel import Session, SQLModel

CONTENT = frozenset(
    """
organization organizationconfig role badgecollection learningbadge
learningbadgeversion learningpath learningactivity learningpage learningvariable
badgeissuerauthorization program programobjective programphase objective
organizationplanrole requirementframework requirementframeworkversion requirementnode
programobjectiverequirement resourcetag resourcetaglink resource resourcesearchdocument
resourcechannel resourcechannelresource resourceauthor podcast podcastepisode
usergroup usergroupresource board community playground newsarticle
""".split()
)
PERSONAL = frozenset(
    """
userorganization usergroupuser programparticipant objectiveprogress learningrun
learningresponseattempt learningbadgeaward badgeissuerlearnerlink
requirementenrollment usersavedresource userresourcechannel resourcenoteblock
portfolio hubconversation hubmemorypreference hubmemory hubeditrun
boardmember playgroundreaction inboxmessage mediaasset mediafolder
""".split()
)
# These rows belong to the fake learner but carry the catalog creator's org_id.
# Keep their prepared state when the fictional org uses a shared live badge.
CATALOG_PERSONAL = frozenset("learningrun learningbadgeaward".split())
CHILDREN = frozenset(
    """
learningactivityrun learningpageprogress usersavedresourcechannel portfoliosection
projectitem projectitemblock timelineentry timelineentryblock timelineprojectlink
portfoliolink profiletrait planrole planphase planobjective planobjectiveprogress
planattachment planactivity hubconversationmessage hubconversationmessageresource
hubconversationresource hubmemorysource hubconversationmessagememory hubeditrunevent
hubeditobjectstate requirementattainmentsource
""".split()
)
# Private peer work is deliberately excluded even when it belongs to an included org.
ANCHORS = {
    "learningbadgeversion": "badge_id",
    "learningpath": "version_id",
    "learningactivity": "path_id",
    "learningpage": "activity_id",
    "learningvariable": "org_id",
    "learningactivityrun": "run_id",
    "learningpageprogress": "run_id",
    "usersavedresourcechannel": "saved_resource_id",
    "portfoliosection": "portfolio_id",
    "projectitem": "portfolio_id",
    "projectitemblock": "project_item_id",
    "timelineentry": "portfolio_id",
    "timelineentryblock": "timeline_entry_id",
    "timelineprojectlink": "timeline_entry_id",
    "portfoliolink": "portfolio_id",
    "profiletrait": "portfolio_id",
    "planrole": "plan_id",
    "planphase": "plan_id",
    "planobjective": "plan_id",
    "planobjectiveprogress": "plan_objective_id",
    "planattachment": "plan_id",
    "planactivity": "plan_id",
    "planinvitation": "plan_id",
    "plancollaboratorrequest": "plan_id",
    "hubconversationmessage": "conversation_id",
    "hubconversationmessageresource": "message_id",
    "hubconversationresource": "conversation_id",
    "hubmemorysource": "memory_id",
    "hubconversationmessagememory": "message_id",
    "hubeditrunevent": "run_id",
    "hubeditobjectstate": "run_id",
    "requirementattainmentsource": "enrollment_id",
    "programobjective": "program_id",
    "programphase": "program_id",
    "requirementframeworkversion": "framework_id",
    "requirementnode": "version_id",
    "programobjectiverequirement": "program_objective_id",
    "resourcetaglink": "resource_id",
    "resourcechannelresource": "channel_id",
}
FORBIDDEN = frozenset(
    """
apitoken ssoconnection customdomain auditlog orgpack usageevent guestsession
paymentsconfig paymentsenrollment paymentsoffer paymentsofferresource paymentsgroup
paymentsgroupresource paymentsgroupsync organizationinvitation organizationjoinlink
planinvitation plancollaboratorrequest discussion discussioncomment discussionvote
discussioncommentvote discussionreaction resourcecomment
hubadvisorconfiguration hubadvisorproviderconfiguration inboxmessagetemplate
learningbadgenotificationsignup
""".split()
)


def encode_value(value):
    if isinstance(value, bytes):
        return {"$bytes": b64encode(value).decode()}
    if isinstance(value, (datetime, date)):
        return {"$date": value.isoformat()}
    if isinstance(value, Enum):
        return value.name
    if isinstance(value, dict):
        return {key: encode_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [encode_value(item) for item in value]
    if hasattr(value, "tolist"):
        return value.tolist()
    return value


def capture(
    db: Session, user_id: int, entry_org_id: int, cohort_ids: set[int] | None = None
) -> dict:
    tables = SQLModel.metadata.tables
    rows: dict[str, dict] = {name: {} for name in tables}

    def add(name, values):
        table = tables[name]
        for value in values:
            record = dict(value)
            key = tuple(record[c.name] for c in table.primary_key)
            rows[name][key] = record

    def read(name, condition):
        return db.execute(select(tables[name]).where(condition)).mappings().all()

    user_ids = cohort_ids or {user_id}
    memberships = read(
        "userorganization", tables["userorganization"].c.user_id.in_(user_ids)
    )
    if cohort_ids is not None:
        memberships = [
            record for record in memberships if record["org_id"] == entry_org_id
        ]
    org_ids = {record["org_id"] for record in memberships}
    if entry_org_id not in org_ids:
        raise HTTPException(422, "The demo user must belong to the entry organization.")
    add("user", read("user", tables["user"].c.id.in_(user_ids)))
    add("organization", read("organization", tables["organization"].c.id.in_(org_ids)))
    add("userorganization", memberships)
    for name in PERSONAL:
        table = tables[name]
        owner = next(
            (
                table.c[key]
                for key in ("user_id", "recipient_user_id", "owner_user_id")
                if key in table.c
            ),
            None,
        )
        if owner is not None:
            condition = owner.in_(user_ids)
            if (
                cohort_ids is not None
                and "org_id" in table.c
                and name not in CATALOG_PERSONAL
            ):
                condition &= table.c.org_id == entry_org_id
            add(name, read(name, condition))
    plan = tables["plan"]
    collaborators = read(
        "plancollaborator", tables["plancollaborator"].c.user_id.in_(user_ids)
    )
    plan_ids = {record["plan_id"] for record in collaborators}
    add(
        "plan",
        read(
            "plan",
            or_(
                plan.c.subject_user_id.in_(user_ids),
                plan.c.owner_user_id.in_(user_ids),
                plan.c.id.in_(plan_ids),
            ),
        ),
    )
    if cohort_ids is not None:
        rows["plan"] = {
            key: record
            for key, record in rows["plan"].items()
            if record["source_org_id"] in (None, entry_org_id)
        }
    # Include collaborators only on this learner's plans, never their other work.
    add(
        "plancollaborator",
        read(
            "plancollaborator",
            tables["plancollaborator"].c.plan_id.in_(
                [record["id"] for record in rows["plan"].values()]
            ),
        ),
    )
    for name in CONTENT:
        table = tables[name]
        if "org_id" in table.c:
            condition = table.c.org_id.in_(org_ids)
            if name == "board":
                condition = condition & or_(
                    table.c.public.is_(True), table.c.created_by.in_(user_ids)
                )
            add(name, read(name, condition))
        elif name == "role":
            add(name, read(name, table.c.org_id.is_(None)))
        elif cohort_ids is not None and name == "badgeissuerauthorization":
            add(
                name,
                read(
                    name,
                    or_(
                        table.c.issuer_org_id.in_(org_ids),
                        table.c.creator_org_id.in_(org_ids),
                    ),
                ),
            )
        elif cohort_ids is not None and name == "resourceauthor":
            add(name, read(name, table.c.user_id.in_(user_ids)))
    # Group/resource links use UUIDs rather than a database foreign key.
    # Preserve shared catalog resources assigned to the fictional cohort.
    if cohort_ids is not None:
        resource_uuids = {
            record["resource_uuid"] for record in rows["usergroupresource"].values()
        }
        resource_uuids |= {
            record["resource_uuid"] for record in rows["resourceauthor"].values()
        }
        if resource_uuids:
            add(
                "resource",
                read(
                    "resource", tables["resource"].c.resource_uuid.in_(resource_uuids)
                ),
            )
    if cohort_ids is not None:
        for name in ("programassignment", "requirementassignmentbatch"):
            add(name, read(name, tables[name].c.org_id == entry_org_id))
    # Iterate to a fixed point; never follow private peer state or credential tables.
    scenario_tables = set()
    if cohort_ids is not None:
        scenario_tables = set(
            "discussion discussioncomment discussionvote discussioncommentvote discussionreaction planinvitation plancollaboratorrequest".split()
        )
        for name in scenario_tables - {"planinvitation", "plancollaboratorrequest"}:
            table = tables[name]
            owner = table.c.author_id if "author_id" in table.c else table.c.user_id
            condition = owner.in_(user_ids)
            if "org_id" in table.c:
                condition &= table.c.org_id == entry_org_id
            add(name, read(name, condition))
    allowed = (
        scenario_tables
        | CONTENT
        | PERSONAL
        | CHILDREN
        | {
            "user",
            "plan",
            "plancollaborator",
            "programassignment",
            "requirementassignmentbatch",
        }
    )
    for _ in range(len(tables)):
        before = sum(map(len, rows.values()))
        for name in allowed:
            table = tables[name]
            for column in table.c:
                for fk in column.foreign_keys:
                    parent = fk.column.table.name
                    if parent not in allowed:
                        continue
                    values = {
                        record[column.name]
                        for record in rows[name].values()
                        if record[column.name] is not None
                    }
                    if values:
                        if cohort_ids is not None and parent == "user":
                            values &= user_ids
                        add(parent, read(parent, fk.column.in_(values)))
                    if ANCHORS.get(name) == column.name:
                        parent_values = {
                            record[fk.column.name] for record in rows[parent].values()
                        }
                        if parent_values:
                            condition = column.in_(parent_values)
                            if (
                                cohort_ids is not None
                                and name == "learningbadgeversion"
                            ):
                                condition &= or_(
                                    table.c.org_id.in_(org_ids),
                                    table.c.state == "published",
                                )
                            add(name, read(name, condition))
        # Legacy unversioned paths have no version FK to anchor from.
        badge_ids = {record["id"] for record in rows["learningbadge"].values()}
        if badge_ids:
            path = tables["learningpath"]
            add(
                "learningpath",
                read(
                    "learningpath",
                    path.c.badge_id.in_(badge_ids) & path.c.version_id.is_(None),
                ),
            )
        if before == sum(map(len, rows.values())):
            break
    # Role IDs are global in legacy authorization; include definitions, not memberships.
    add(
        "role",
        read(
            "role",
            or_(
                tables["role"].c.org_id.in_(org_ids), tables["role"].c.org_id.is_(None)
            ),
        ),
    )
    for record in rows["user"].values():
        is_source = record["id"] in user_ids
        record.update(
            password="!demo-login-disabled",
            is_superadmin=False,
            failed_login_attempts=0,
            locked_until=None,
            last_login_ip=None,
        )
        if not is_source:
            record.update(
                email=f"person-{record['id']}@demo.example.com",
                bio="",
                details={},
                profile={},
                avatar_image="",
                last_login_at=None,
            )
    if cohort_ids is not None:
        from src.services.demo.scenario import exclude_real_users

        exclude_real_users(rows, tables, user_ids, PERSONAL)
    # Empty live-only tokens embedded in configuration/content JSON; never copy scripts.
    for name, records in rows.items():
        for record in records.values():
            for column in tables[name].c:
                if record[column.name] is not None and any(
                    fk.column.table.name not in allowed for fk in column.foreign_keys
                ):
                    if not column.nullable:
                        raise HTTPException(
                            422,
                            f"This account references unsupported demo data in {name}. Contact the platform team before publishing.",
                        )
                    record[column.name] = None
            if name == "organization":
                record["scripts"] = {}
            for key, value in record.items():
                if any(
                    part in key.lower()
                    for part in ("secret", "password", "token", "api_key", "ciphertext")
                ):
                    if key != "password":
                        record[key] = None if tables[name].c[key].nullable else ""
                elif isinstance(value, (dict, list)):
                    record[key] = scrub_json(value)
    # Imported cross-org badge dependencies bring their org/config, preserving issuer relationships.
    return {
        name: [encode_value(value) for value in records.values()]
        for name, records in rows.items()
        if records
    }


def scrub_json(value):
    if isinstance(value, dict):
        return {
            key: (
                None
                if any(
                    part in key.lower()
                    for part in ("secret", "password", "token", "api_key", "ciphertext")
                )
                else scrub_json(item)
            )
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [scrub_json(item) for item in value]
    return value
