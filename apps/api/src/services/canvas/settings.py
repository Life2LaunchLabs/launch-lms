"""Organization settings › Canvas: what the school's Canvas admin needs, and what they paste back (OP-1).

Canvas is on every tier, free included (Product lead, 2026-11-17). Only the organization's admins edit it.
"""

from __future__ import annotations

import re
from datetime import datetime

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from src.db.canvas import CanvasConnection
from src.services.canvas import connections

CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
DEPLOYMENT_PATTERN = re.compile(r"^[A-Za-z0-9:._-]{1,128}$")
ISSUER_PATTERN = re.compile(r"^https://[a-z0-9.-]+(:\d{1,5})?$")


class CanvasSettingsUpdate(BaseModel):
    canvas_host: str = Field(default="", max_length=300)
    client_id: str = Field(default="", max_length=64)
    # One or more, as Canvas shows them; commas, spaces or new lines between several.
    deployment_ids: str = Field(default="", max_length=2000)
    issuer: str | None = Field(default=None, max_length=300)
    enabled: bool = False
    ages_confirmed: bool = False


def tool_details() -> dict:
    urls = connections.tool_urls()
    return {
        "config_url": urls["config"],
        "login_url": urls["login"],
        "launch_url": urls["launch"],
        "redirect_uri": urls["launch"],
        "jwks_url": urls["jwks"],
    }


def _read(connection: CanvasConnection | None) -> dict | None:
    if not connection:
        return None
    return {
        "canvas_host": connection.canvas_host,
        "client_id": connection.client_id,
        "deployment_ids": list(connection.deployment_ids or []),
        "issuer": connection.issuer,
        "enabled": connection.enabled,
        "ages_confirmed": bool(connection.ages_confirmed_at),
        "ages_confirmed_at": connection.ages_confirmed_at,
        "update_date": connection.update_date,
    }


def get_settings(db: Session, org_id: int) -> dict:
    return {"connection": _read(connections.for_org(db, org_id)), "tool": tool_details()}


def _deployments(raw: str) -> list[str]:
    values = [value for value in re.split(r"[\s,]+", raw.strip()) if value]
    if len(values) > 20 or any(not DEPLOYMENT_PATTERN.fullmatch(value) for value in values):
        raise HTTPException(status_code=422, detail="A deployment id looks like 7:2a1b9c… Copy it from Canvas exactly.")
    return list(dict.fromkeys(values))


def save_settings(db: Session, org_id: int, user_id: int, body: CanvasSettingsUpdate) -> dict:
    host = connections.clean_host(body.canvas_host)
    if body.canvas_host.strip() and not host:
        raise HTTPException(status_code=422, detail="Enter your Canvas address, like school.instructure.com.")
    client_id = body.client_id.strip()
    if client_id and not CLIENT_ID_PATTERN.fullmatch(client_id):
        raise HTTPException(status_code=422, detail="The client id is the number Canvas shows for the developer key, like 10000000000042.")
    deployments = _deployments(body.deployment_ids)
    issuer = (body.issuer or "").strip().rstrip("/").lower() or connections.default_issuer(host)
    if not ISSUER_PATTERN.fullmatch(issuer):
        raise HTTPException(status_code=422, detail="The issuer is an https address, like https://canvas.instructure.com.")

    connection = connections.for_org(db, org_id)
    now = str(datetime.now())
    if body.enabled:
        missing = [label for label, value in (("Canvas address", host), ("client id", client_id), ("deployment id", deployments)) if not value]
        if missing:
            raise HTTPException(status_code=422, detail=f"Add the {' and '.join(missing)} before switching it on.")
        if not body.ages_confirmed and not (connection and connection.ages_confirmed_at):
            raise HTTPException(status_code=422, detail="Confirm the courses using Life2Launch are for students 13 and over.")
    if client_id:
        taken = db.exec(select(CanvasConnection).where(
            CanvasConnection.issuer == issuer, CanvasConnection.client_id == client_id, CanvasConnection.org_id != org_id,
        )).first()
        if taken:
            raise HTTPException(status_code=409, detail="This Canvas developer key is already connected to another organization on Life2Launch.")

    connection = connection or CanvasConnection(org_id=org_id, creation_date=now)
    connection.canvas_host = host
    connection.client_id = client_id
    connection.deployment_ids = deployments
    connection.issuer = issuer
    connection.enabled = body.enabled
    if body.ages_confirmed and not connection.ages_confirmed_at:
        connection.ages_confirmed_by = user_id
        connection.ages_confirmed_at = now
    connection.update_date = now
    db.add(connection)
    db.commit()
    db.refresh(connection)
    return get_settings(db, org_id)
