"""The small pages a Canvas launch passes through inside the Canvas frame (served by the API, no app shell)."""

from __future__ import annotations

import json
import secrets
from html import escape

from fastapi.responses import HTMLResponse

_STYLE = """
:root{color-scheme:light dark;--bg:#ffffff;--fg:#18181b;--muted:#52525b;--primary:#18181b;--on-primary:#ffffff;--border:#e4e4e7}
@media (prefers-color-scheme:dark){:root{--bg:#09090b;--fg:#fafafa;--muted:#a1a1aa;--primary:#fafafa;--on-primary:#18181b;--border:#27272a}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px 16px}
main{max-width:420px;width:100%;text-align:center}h1{font-size:20px;line-height:1.3;margin:0 0 8px}
p{margin:0 0 16px;color:var(--muted)}form{margin:0}.actions{display:flex;flex-direction:column;gap:12px;margin-top:20px}
button{font:inherit;font-weight:600;min-height:44px;padding:10px 16px;border-radius:10px;cursor:pointer;width:100%;
border:1px solid var(--border);background:transparent;color:var(--fg)}button.primary{background:var(--primary);
color:var(--on-primary);border-color:var(--primary)}button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
#note,#opened{margin-top:16px}[hidden]{display:none!important}.spinner{width:28px;height:28px;margin:0 auto 16px;border-radius:50%;
border:3px solid var(--border);border-top-color:var(--fg);animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.spinner{animation:none}}
"""


def _page(title: str, body: str, script: str = "", status_code: int = 200, form_action: str | None = None) -> HTMLResponse:
    nonce = secrets.token_urlsafe(16)
    html = (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        f"<meta name=\"referrer\" content=\"strict-origin\"><title>{escape(title)}</title>"
        f"<style nonce=\"{nonce}\">{_STYLE}</style></head><body><main>{body}</main>"
        + (f"<script nonce=\"{nonce}\">{script}</script>" if script else "")
        + "</body></html>"
    )
    csp = (
        f"default-src 'none'; style-src 'nonce-{nonce}'; script-src 'nonce-{nonce}'; "
        f"form-action {form_action or chr(39) + 'self' + chr(39)}; base-uri 'none'"
    )
    return HTMLResponse(html, status_code=status_code, headers={
        "Content-Security-Policy": csp,
        "Cache-Control": "no-store",
        # Not no-referrer: that makes the browser send "Origin: null" on our own posts, which the Origin check refuses.
        "Referrer-Policy": "strict-origin",
    })


def _hidden(fields: dict) -> str:
    return "".join(
        f"<input type=\"hidden\" name=\"{escape(k)}\" value=\"{escape(str(v))}\">" for k, v in fields.items()
    )


def error_page(message: str, status_code: int = 400) -> HTMLResponse:
    return _page(
        "Life2Launch couldn't open",
        f"<h1>Life2Launch couldn't open</h1><p>{escape(message)}</p>",
        status_code=status_code,
    )


def login_redirect(authorize_url: str, params: dict, state: str, storage_target: str | None,
                   platform_origin: str) -> HTMLResponse:
    """Send the browser on to Canvas to sign, after keeping the state in Canvas's platform storage if it offers it."""
    script = (
        "(function(){var f=document.getElementById('go');"
        f"var target={json.dumps(storage_target)},origin={json.dumps(platform_origin)},state={json.dumps(state)};"
        "if(!target||!window.parent||window.parent===window){f.submit();return}"
        "var frame;try{frame=window.parent.frames[target]}catch(e){}"
        "if(!frame){f.submit();return}"
        "var id='put_'+Math.random().toString(36).slice(2),done=false;"
        "function go(){if(!done){done=true;f.submit()}}"
        "window.addEventListener('message',function(e){if(e.origin===origin&&e.data&&e.data.message_id===id)go()});"
        "try{frame.postMessage({subject:'lti.put_data',message_id:id,key:'state_'+state,value:state},origin)}catch(e){}"
        "setTimeout(go,1500)})();"
    )
    body = (
        "<div class=\"spinner\" aria-hidden=\"true\"></div><h1>Opening Life2Launch…</h1>"
        f"<form id=\"go\" method=\"get\" action=\"{escape(authorize_url)}\">{_hidden(params)}"
        "<noscript><button class=\"primary\" type=\"submit\">Continue</button></noscript></form>"
    )
    return _page("Opening Life2Launch", body, script, form_action=_origin_of(authorize_url))


def _origin_of(url: str) -> str:
    from urllib.parse import urlsplit

    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def launch_handoff(session_url: str, ticket: str, state: str, cookie_ok: bool, storage_target: str | None,
                   platform_origin: str) -> HTMLResponse:
    """Hand the checked launch to the organization's own site. Without the state cookie, check platform storage first."""
    script = (
        "(function(){var f=document.getElementById('go');"
        f"if({json.dumps(cookie_ok)}){{f.submit();return}}"
        f"var target={json.dumps(storage_target)},origin={json.dumps(platform_origin)},state={json.dumps(state)};"
        "function fail(){document.getElementById('wait').hidden=true;document.getElementById('fail').hidden=false}"
        "var frame;try{frame=target&&window.parent.frames[target]}catch(e){}"
        "if(!frame){fail();return}"
        "var id='get_'+Math.random().toString(36).slice(2);"
        "window.addEventListener('message',function(e){if(e.origin!==origin||!e.data||e.data.message_id!==id)return;"
        "if(e.data.value===state){f.submit()}else{fail()}});"
        "try{frame.postMessage({subject:'lti.get_data',message_id:id,key:'state_'+state},origin)}catch(e){fail()}"
        "setTimeout(function(){if(!document.getElementById('fail').hidden)return;fail()},3000)})();"
    )
    body = (
        "<div id=\"wait\"><div class=\"spinner\" aria-hidden=\"true\"></div><h1>Opening Life2Launch…</h1></div>"
        "<div id=\"fail\" hidden><h1>Life2Launch couldn't open</h1>"
        "<p>This browser blocked the check Life2Launch needs. Open Life2Launch from Canvas again.</p></div>"
        f"<form id=\"go\" method=\"post\" action=\"{escape(session_url)}\">{_hidden({'ticket': ticket, 'mode': 'frame'})}"
        "<noscript><button class=\"primary\" type=\"submit\">Continue</button></noscript></form>"
    )
    return _page("Opening Life2Launch", body, script, form_action=_origin_of(session_url))


def session_check(destination: str, session_url: str, frame_ticket: str, tab_ticket: str, retried: bool) -> HTMLResponse:
    """Go on into Life2Launch if the partitioned cookies stuck; otherwise offer storage access and a new tab."""
    script = (
        "(function(){"
        "var ok=document.cookie.split(';').some(function(c){return c.trim()==='launchlms_has_session=1'});"
        f"var dest={json.dumps(destination)};"
        "if(ok){location.replace(dest);return}"
        "document.getElementById('wait').hidden=true;document.getElementById('blocked').hidden=false;"
        "var retry=document.getElementById('retry'),ask=document.getElementById('ask'),note=document.getElementById('note');"
        f"if({json.dumps(not retried)}&&document.requestStorageAccess){{ask.hidden=false;"
        "ask.addEventListener('click',function(){document.requestStorageAccess().then(function(){retry.submit()},"
        "function(){ask.hidden=true;note.hidden=false})})}"
        "document.getElementById('tab').addEventListener('submit',function(){"
        "setTimeout(function(){document.getElementById('opened').hidden=false},300)})})();"
    )
    body = (
        "<div id=\"wait\"><div class=\"spinner\" aria-hidden=\"true\"></div><h1>Opening Life2Launch…</h1></div>"
        "<div id=\"blocked\" hidden><h1>Open Life2Launch</h1>"
        "<p>This browser won't let Life2Launch sign you in inside Canvas.</p>"
        "<div class=\"actions\">"
        f"<form id=\"tab\" method=\"post\" action=\"{escape(session_url)}\" target=\"_blank\">"
        f"{_hidden({'ticket': tab_ticket, 'mode': 'tab'})}"
        "<button class=\"primary\" type=\"submit\">Open in a new tab</button></form>"
        "<button id=\"ask\" type=\"button\" hidden>Let Life2Launch sign in here</button>"
        "</div>"
        "<p id=\"note\" hidden>Your browser said no. Open Life2Launch in a new tab instead.</p>"
        "<p id=\"opened\" hidden>Life2Launch opened in a new tab, signed in. If it didn't, open Life2Launch from Canvas again.</p>"
        f"<form id=\"retry\" method=\"post\" action=\"{escape(session_url)}\">"
        f"{_hidden({'ticket': frame_ticket, 'mode': 'frame', 'retry': '1'})}</form>"
        "</div>"
    )
    # form-action also covers where the post redirects (the organization's page), so name both origins.
    # The organization's site may send a learner on to the main site, so that one too.
    from src.services.oauth.config import frontend_url

    origins = " ".join(dict.fromkeys((_origin_of(session_url), _origin_of(destination), frontend_url())))
    return _page("Opening Life2Launch", body, script, form_action=origins)
