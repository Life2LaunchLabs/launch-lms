"""An MCP tool: its definition for tools/list, and the handler, scope and flags the server checks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable

from fastapi import Request
from sqlmodel import Session

from src.services.mcp.app_shell import PREVIEW_APP_URI
from src.services.oauth.server import AccessContext

Handler = Callable[[Request, Session, AccessContext, dict], Awaitable[dict]]

_ORG = {
    "type": "string",
    "description": "Slug of the organization to act in (see list_organizations). Omit to use the organization chosen when connecting.",
}


@dataclass(frozen=True)
class Tool:
    name: str
    title: str
    description: str
    input_schema: dict
    handler: Handler
    scope: str = "activities:read"
    read_only: bool = True
    ui: bool = False
    org_scoped: bool = True
    # Platform tools (Coach) are listed only to platform admins.
    platform: bool = False

    def definition(self) -> dict:
        input_schema = {"type": "object", **self.input_schema}
        if self.org_scoped:
            input_schema["properties"] = {**input_schema.get("properties", {}), "org": _ORG}
        definition = {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "inputSchema": input_schema,
            "annotations": {
                "title": self.title,
                "readOnlyHint": self.read_only,
                "destructiveHint": False,
                "idempotentHint": self.read_only,
                "openWorldHint": False,
            },
        }
        if self.ui:
            definition["_meta"] = {"ui": {"resourceUri": PREVIEW_APP_URI}, "ui/resourceUri": PREVIEW_APP_URI}
        return definition
