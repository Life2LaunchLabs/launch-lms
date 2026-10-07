"""Remove identities outside the explicitly fictional cohort, preserving FK integrity."""

from fastapi import HTTPException

# An empty collaborator/participant edge is not useful and can leak membership.
USER_EDGES = frozenset(
    "userorganization usergroupuser programparticipant plancollaborator boardmember resourceauthor programassignment requirementassignmentbatch discussion discussioncomment discussionvote discussioncommentvote discussionreaction".split()
)


def exclude_real_users(
    rows: dict, tables: dict, cohort_ids: set[int], personal: frozenset = frozenset()
) -> None:
    emails = {row["email"] for row in rows["user"].values() if row["id"] in cohort_ids}
    uuids = {
        row["user_uuid"] for row in rows["user"].values() if row["id"] in cohort_ids
    }
    rows["user"] = {
        key: row for key, row in rows["user"].items() if row["id"] in cohort_ids
    }

    def references(value):
        if isinstance(value, list):
            return [
                references(item)
                for item in value
                if not (
                    isinstance(item, dict)
                    and "user_id" in item
                    and item["user_id"] not in cohort_ids
                )
            ]
        if not isinstance(value, dict):
            return value
        result = {}
        for key, item in value.items():
            if key.endswith("user_ids") and isinstance(item, list):
                result[key] = [
                    identifier for identifier in item if identifier in cohort_ids
                ]
            elif (
                key.endswith("user_id")
                and isinstance(item, int)
                and item not in cohort_ids
            ):
                result[key] = None
            elif key.endswith("user_uuid") and item not in uuids:
                result[key] = None
            elif (
                key
                in {"subject_email", "recipient_email", "sender_email", "user_email"}
                and item not in emails
            ):
                result[key] = None
            else:
                result[key] = references(item)
        return result

    for name, records in rows.items():
        table = tables[name]
        for key, row in list(records.items()):
            remove = (
                name in {"programassignment", "requirementassignmentbatch"}
                and bool(row.get("subject_email"))
                and row["subject_email"] not in emails
            )
            if name in {"planinvitation", "plancollaboratorrequest"}:
                remove = row["email"].lower() not in {email.lower() for email in emails}
            if name in personal:
                owner = next(
                    (
                        field
                        for field in ("user_id", "recipient_user_id", "owner_user_id")
                        if field in row
                    ),
                    None,
                )
                if owner and row[owner] is not None and row[owner] not in cohort_ids:
                    remove = True
            if (
                name == "plan"
                and row.get("subject_user_id") is not None
                and row["subject_user_id"] not in cohort_ids
            ):
                remove = True
            if (
                name == "inboxmessage"
                and row.get("sender_user_id") is not None
                and row["sender_user_id"] not in cohort_ids
            ):
                remove = True
            for column in table.c:
                if any(fk.column.table.name == "user" for fk in column.foreign_keys):
                    if (
                        row[column.name] is not None
                        and row[column.name] not in cohort_ids
                    ):
                        if (
                            name in USER_EDGES
                            and column.name in {"user_id", "author_id"}
                        ) or not column.nullable:
                            remove = True
                        else:
                            row[column.name] = None
            if remove:
                del records[key]
            else:
                row.update(references(row))
    # Dropping a real-user edge may orphan a required child. Resolve all levels;
    # dangling nullable attributions disappear without dropping the actual content.
    for _ in range(len(tables)):
        changed = False
        for name, records in rows.items():
            for key, row in list(records.items()):
                remove = False
                for column in tables[name].c:
                    for fk in column.foreign_keys:
                        parent = fk.column.table.name
                        if row[column.name] is None or parent not in rows:
                            continue
                        if not any(
                            record[fk.column.name] == row[column.name]
                            for record in rows[parent].values()
                        ):
                            if column.nullable:
                                row[column.name] = None
                                changed = True
                            else:
                                remove = True
                if remove:
                    del records[key]
                    changed = True
        if not changed:
            return
    raise HTTPException(
        422, "The demo scenario contains unsupported cyclic references."
    )
