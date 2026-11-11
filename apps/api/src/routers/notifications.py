"""Email notifications: your switches (signed in), and the "Stop these emails" page a notification links to (no sign-in)."""

import html

from fastapi import APIRouter, Depends, Form, Query
from fastapi.responses import HTMLResponse
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.notifications import preferences, unsubscribe

router = APIRouter()
public_router = APIRouter()


@router.get("/users/me/email_notifications", tags=["users"])
async def api_get_my_email_notifications(db_session: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Which emails you get: one switch per kind, staff ones only for staff."""
    return preferences.view(db_session, current_user.id)


@router.put("/users/me/email_notifications", tags=["users"])
async def api_save_my_email_notifications(payload: dict[str, bool], db_session: Session = Depends(get_db_session),
                                          current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Switch some on or off: {"review_requests": false}."""
    return preferences.save(db_session, current_user.id, payload)


def _page(title: str, text: str, token: str | None = None, on: bool | None = None) -> HTMLResponse:
    button = ""
    if token is not None and on is not None:
        label = "Turn them back on" if on else "Stop these emails"
        button = (f'<form method="post"><input type="hidden" name="token" value="{html.escape(token)}">'
                  f'<input type="hidden" name="on" value="{"1" if on else "0"}">'
                  f'<button type="submit" style="font:inherit;font-weight:600;padding:10px 18px;border-radius:10px;border:0;'
                  f'background:#111;color:#fff;cursor:pointer">{label}</button></form>')
    return HTMLResponse(f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>{html.escape(title)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;margin:0;padding:48px 16px">
<main style="max-width:460px;margin:0 auto"><h1 style="font-size:22px">{html.escape(title)}</h1><p style="line-height:1.5">{text}</p>{button}</main></body></html>""")


_BAD = ("That link doesn't work", "It may have been copied only in part. You can switch emails off in Settings once you sign in.")


@public_router.get("/notifications/unsubscribe", response_class=HTMLResponse, include_in_schema=False)
async def unsubscribe_page(token: str = Query(""), db_session: Session = Depends(get_db_session)) -> HTMLResponse:
    """Asks first, so a mail scanner opening the link changes nothing."""
    found = unsubscribe.resolve(db_session, token)
    if not found:
        return _page(*_BAD)
    label = html.escape(unsubscribe.STREAMS[found[1]].label)
    return _page("Stop these emails?", f"You won't get “{label}” emails anymore. You can turn them back on in Settings.", token, False)


@public_router.post("/notifications/unsubscribe", response_class=HTMLResponse, include_in_schema=False)
async def unsubscribe_apply(token: str = Form(""), on: str = Form("0"), db_session: Session = Depends(get_db_session)) -> HTMLResponse:
    switch_on = on == "1"
    label = unsubscribe.apply(db_session, token, switch_on)
    if label is None:
        return _page(*_BAD)
    if switch_on:
        return _page("They're back on", f"You'll get “{html.escape(label)}” emails again.", token, False)
    return _page("Done", f"You won't get “{html.escape(label)}” emails anymore.", token, True)
