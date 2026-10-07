"""Materialize complete DB namespaces with no search-path fallback to live data."""

import re
import hashlib
from base64 import b64decode
from datetime import datetime
from functools import lru_cache
from uuid import uuid4

from sqlalchemy import MetaData, event, text
from sqlmodel import Session, SQLModel

NAMESPACE = re.compile(r"^demo_[0-9a-f]{32}$")


def vector_distance(column, embedding):
    from sqlalchemy import Float
    from src.services.demo.context import current_demo

    if current_demo.get():
        # The extension lives in public; qualify its operator without allowing
        # unqualified table queries to fall back to live product data.
        return column.op("OPERATOR(public.<=>)", return_type=Float)(embedding)
    return column.cosine_distance(embedding)


def schema_signature() -> str:
    return _schema_signature(len(SQLModel.metadata.tables))


@lru_cache(maxsize=8)
def _schema_signature(table_count: int) -> str:
    description = "\n".join(
        f"{table.name}.{column.name}:{column.type}:{column.nullable}"
        for table in sorted(
            SQLModel.metadata.tables.values(), key=lambda item: item.name
        )
        for column in table.c
    )
    return hashlib.sha256(description.encode()).hexdigest()


def validate_namespace(name: str) -> str:
    if not NAMESPACE.fullmatch(name):
        raise ValueError("Invalid demo namespace")
    return name


def lock_ddl(connection) -> None:
    # Four bounded lanes keep cold starts moving without exhausting the shared
    # PostgreSQL lock table. Creation and deletion use the same global lanes.
    for slot in range(4):
        if connection.execute(
            text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": 1480870212 + slot}
        ).scalar():
            return
    connection.execute(text("SELECT pg_advisory_xact_lock(1480870212)"))


def decode_value(value):
    if isinstance(value, dict):
        if set(value) == {"$bytes"}:
            return b64decode(value["$bytes"])
        if set(value) == {"$date"}:
            return datetime.fromisoformat(value["$date"])
        return {key: decode_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [decode_value(item) for item in value]
    return value


def remap(data: dict, session_id: str) -> tuple[dict, dict]:
    identifiers = {}
    for records in data.values():
        for record in records:
            for key, value in record.items():
                if (
                    key in {"org_uuid", "user_uuid", "board_uuid"}
                    and isinstance(value, str)
                    and value
                ):
                    prefix = value.split("_", 1)[0]
                    identifiers.setdefault(
                        value, f"{prefix}_demo_{session_id}_{uuid4().hex}"
                    )

    def replace(value):
        if isinstance(value, str):
            for old, new in identifiers.items():
                value = value.replace(old, new)
            # Private files use the visitor's host/cookies, including when the
            # live account stored an absolute CDN or API URL inside HTML/JSON.
            value = re.sub(
                r'https?://[^/\s"<>]+/(?:api/v1/)?(content/[^\s"<>]+)',
                lambda match: (
                    "/" + match.group(1)
                    if f"_demo_{session_id}_" in match.group(1)
                    else match.group(0)
                ),
                value,
            )
            return value
        if isinstance(value, dict):
            return {replace(key): replace(item) for key, item in value.items()}
        if isinstance(value, list):
            return [replace(item) for item in value]
        return value

    return replace(decode_value(data)), identifiers


def materialize(engine, namespace: str, data: dict) -> None:
    validate_namespace(namespace)
    if engine.dialect.name != "postgresql":
        raise RuntimeError("Demo namespaces require PostgreSQL.")
    metadata = MetaData()
    for table in SQLModel.metadata.tables.values():
        table.to_metadata(metadata, schema=namespace)
    with engine.begin() as conn:
        # Bound DDL bursts across all API processes. Hundreds of concurrent
        # table/index creations exhaust PostgreSQL's shared lock table.
        lock_ddl(conn)
        conn.execute(text(f'CREATE SCHEMA "{namespace}"'))
        from sqlalchemy.schema import CreateTable, CreateIndex

        # Types/extensions are already migration-managed in the primary schema.
        # Skip per-table existence checks and import cyclic references before FKs.
        for table in metadata.tables.values():
            conn.execute(CreateTable(table, include_foreign_key_constraints=[]))
            for index in table.indexes:
                if not index.unique and not data.get(table.name):
                    continue  # Tiny disposable features do not need empty secondary indexes.
                # Index names need only be unique within this schema. Including
                # the session UUID triggers PostgreSQL truncation/hash collisions.
                signature = (
                    table.name
                    + ":"
                    + str(index.name)
                    + ":"
                    + ",".join(column.name for column in index.columns)
                )
                index.name = "ix_" + hashlib.sha256(signature.encode()).hexdigest()[:24]
                conn.execute(CreateIndex(index))
        for name, records in data.items():
            if records:
                conn.execute(metadata.tables[f"{namespace}.{name}"].insert(), records)
        # Reapply constraints after all rows exist, making unsupported export gaps explicit.
        from sqlalchemy.schema import AddConstraint

        quote = conn.dialect.identifier_preparer.quote
        for table in metadata.tables.values():
            for constraint in table.foreign_key_constraints:
                conn.execute(AddConstraint(constraint))
        for table in metadata.tables.values():
            if "id" in table.c and str(table.c.id.type) in {"INTEGER", "BIGINT"}:
                conn.execute(
                    text(
                        """SELECT setval(pg_get_serial_sequence(:table, 'id'),
                    GREATEST(COALESCE((SELECT MAX(id) FROM """
                        + quote(namespace)
                        + "."
                        + quote(table.name)
                        + """), 0), 1),
                    EXISTS(SELECT 1 FROM """
                        + quote(namespace)
                        + "."
                        + quote(table.name)
                        + "))"
                    ),
                    {"table": f"{namespace}.{table.name}"},
                )


def drop_namespace(engine, namespace: str, *, session_lock: bool = False) -> None:
    validate_namespace(namespace)
    with engine.begin() as conn:
        if session_lock:
            conn.execute(
                text("SELECT pg_advisory_xact_lock(:key)"),
                {"key": int(namespace[5:20], 16)},
            )
        lock_ddl(conn)
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{namespace}" CASCADE'))


def visitor_session(engine, namespace: str, session_id: str) -> Session:
    validate_namespace(namespace)
    session = Session(engine.execution_options(schema_translate_map={None: namespace}))

    @event.listens_for(session, "after_begin")
    def isolate(session, transaction, connection):
        # Revalidate after every commit, preventing revoked sessions from continuing writes.
        active = connection.execute(
            text("""SELECT id FROM public.demosession
            WHERE id=:id AND state='active' AND ended_at IS NULL AND expires_at > timezone('UTC', now())
            AND schema_signature=:signature"""),
            {"id": session_id, "signature": schema_signature()},
        ).first()
        if not active:
            from fastapi import HTTPException

            raise HTTPException(401, "Your demo session has ended. Start a new demo.")
        connection.execute(text(f'SET LOCAL search_path TO "{namespace}", pg_catalog'))

    return session


def context_session() -> Session:
    """Carry isolation into background jobs that open their own transaction."""
    from src.core.events.database import engine
    from src.services.demo.context import current_demo

    context = current_demo.get()
    return (
        visitor_session(engine, context.namespace, context.session_id)
        if context
        else Session(engine)
    )
