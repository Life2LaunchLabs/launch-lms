"""Prove a checkpoint can become a visitor workspace before visitors depend on it."""

import logging
from uuid import uuid4

from fastapi import HTTPException
from src.services.demo.media import isolated_path
from src.services.demo.namespaces import drop_namespace, materialize, remap

logger = logging.getLogger(__name__)


def describe(error: Exception) -> str:
    """Operator-facing cause; the database message names the table and constraint."""
    cause = getattr(error, "orig", None) or error
    lines = [line.strip() for line in str(cause).splitlines() if line.strip()]
    text = " ".join(lines[:2]) or type(cause).__name__
    return f"{type(cause).__name__}: {text}"[:600]


def rehearse(engine, rows: dict, files: dict) -> None:
    """Build one throwaway workspace exactly as visitors get it, then drop it.

    Live data can satisfy the live schema yet not the model-built workspace, so a
    checkpoint that cannot be prepared is rejected here instead of failing every visit.
    """
    if engine.dialect.name != "postgresql":
        return
    identifier = uuid4().hex
    namespace = f"demo_{identifier}"
    try:
        data, identifiers = remap(rows, identifier, files)
        for path in files:
            isolated_path(path, identifiers)
        materialize(engine, namespace, data)
    except Exception as error:
        logger.exception("Demo publish rehearsal failed")
        raise HTTPException(
            422,
            "This version cannot be turned into a visitor workspace, so it was not "
            f"published. {describe(error)}",
        ) from None
    finally:
        drop_namespace(engine, namespace)
