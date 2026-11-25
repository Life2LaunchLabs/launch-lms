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
button,a.button{font:inherit;font-weight:600;min-height:44px;padding:10px 16px;border-radius:10px;cursor:pointer;width:100%;
border:1px solid var(--border);background:transparent;color:var(--fg);display:flex;align-items:center;justify-content:center;
text-decoration:none}button.primary,a.button.primary{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}
button:focus-visible,a.button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}.small{font-size:14px;margin-top:16px}
#note,#opened{margin-top:16px}[hidden]{display:none!important}.spinner{width:28px;height:28px;margin:0 auto 16px;border-radius:50%;
border:3px solid var(--border);border-top-color:var(--fg);animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.spinner{animation:none}}
"""


def _page(title: str, body: str, script: str = "", status_code: int = 200, form_action: str | None = None,
          style: str = "", main_class: str = "") -> HTMLResponse:
    nonce = secrets.token_urlsafe(16)
    html = (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        f"<meta name=\"referrer\" content=\"strict-origin\"><title>{escape(title)}</title>"
        f"<style nonce=\"{nonce}\">{_STYLE}{style}</style></head><body><main{f' class="{main_class}"' if main_class else ''}>{body}</main>"
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


def link_needed(link_url: str) -> HTMLResponse:
    """Shown inside Canvas: the email already has a Life2Launch account elsewhere, so they sign in to it once."""
    body = (
        "<h1>Link your Life2Launch account</h1>"
        "<p>There's already a Life2Launch account with your school email. Sign in to it once and it opens "
        "from Canvas from then on.</p>"
        "<div class=\"actions\">"
        f"<a class=\"button primary\" href=\"{escape(link_url)}\" target=\"_blank\" rel=\"noopener\">Sign in to link</a>"
        "</div>"
        "<p class=\"small\">It opens in a new tab. When it's linked, come back here and open Life2Launch from Canvas again.</p>"
    )
    return _page("Link your Life2Launch account", body, status_code=409)


def choose_account(email: str, school: str, session_url: str, mode: str, new_ticket: str, again_ticket: str,
                   link_url: str) -> HTMLResponse:
    """First time from Canvas, and no account has the Canvas email: new, or sign in to the account they have (DEV-199).
    Signing in opens our own site in a new tab (it works in a Canvas frame whatever the browser does with cookies);
    coming back, Continue opens the account it linked."""
    script = (
        "(function(){document.getElementById('signin').addEventListener('click',function(){"
        "document.getElementById('back').hidden=false})})();"
    )
    body = (
        "<h1>Welcome to Life2Launch</h1>"
        f"<p>{escape(school)} uses Life2Launch in Canvas. Is this your first time on Life2Launch?</p>"
        "<div class=\"actions\">"
        f"<form id=\"new\" method=\"post\" action=\"{escape(session_url)}\">{_hidden({'ticket': new_ticket, 'mode': mode})}"
        "<button class=\"primary\" type=\"submit\">I'm new to Life2Launch</button></form>"
        f"<a id=\"signin\" class=\"button\" href=\"{escape(link_url)}\" target=\"_blank\" rel=\"noopener\">"
        "Already on Life2Launch? Sign in</a>"
        "</div>"
        f"<p class=\"small\">New accounts use {escape(email)}. Already have one, maybe with a personal email? "
        "Sign in to it and your school email is added to it, so you keep one account.</p>"
        "<div id=\"back\" hidden><p>Signing in opened in a new tab. When it says your account is linked, come back here.</p>"
        f"<form method=\"post\" action=\"{escape(session_url)}\">{_hidden({'ticket': again_ticket, 'mode': mode})}"
        "<button type=\"submit\">Continue to Life2Launch</button></form></div>"
    )
    from src.services.oauth.config import frontend_url

    origins = " ".join(dict.fromkeys((_origin_of(session_url), frontend_url())))
    return _page("Welcome to Life2Launch", body, script, form_action=origins)


def link_confirm(email: str, school: str, link_action: str, ticket: str, canvas_email: str | None = None) -> HTMLResponse:
    added = (f" Your school email ({escape(canvas_email)}) is added to this account, so you can sign in with either."
             if canvas_email and canvas_email.strip().lower() != email.strip().lower() else "")
    body = (
        "<h1>Link your school's Canvas</h1>"
        f"<p>Open this Life2Launch account ({escape(email)}) from {escape(school)}'s Canvas from now on? "
        f"You'll also join {escape(school)} on Life2Launch.{added}</p>"
        f"<form method=\"post\" action=\"{escape(link_action)}\">{_hidden({'t': ticket})}"
        "<div class=\"actions\"><button class=\"primary\" type=\"submit\">Link my account</button></div></form>"
    )
    return _page("Link your school's Canvas", body)


def link_sign_in(email: str | None, login_url: str) -> HTMLResponse:
    who = f"the Life2Launch account for {escape(email)}" if email else "your Life2Launch account"
    body = (
        "<h1>Sign in to link</h1>"
        f"<p>Sign in with {who}. Then you can link it to your school's Canvas.</p>"
        f"<div class=\"actions\"><a class=\"button primary\" href=\"{escape(login_url)}\">Sign in</a></div>"
    )
    return _page("Sign in to link", body)


def link_wrong_account(signed_in_as: str, email: str) -> HTMLResponse:
    body = (
        "<h1>That's a different account</h1>"
        f"<p>You're signed in as {escape(signed_in_as)}, but your school's Canvas uses {escape(email)}. "
        f"Sign out of Life2Launch, then open this link again and sign in as {escape(email)}.</p>"
    )
    return _page("That's a different account", body, status_code=403)


def link_done(school: str, open_url: str | None = None) -> HTMLResponse:
    body = (
        "<h1>Linked</h1>"
        f"<p>Your account now opens from {escape(school)}'s Canvas. Go back to Canvas and continue there, "
        "or keep going here.</p>"
        + (f"<div class=\"actions\"><a class=\"button primary\" href=\"{escape(open_url)}\">Open Life2Launch</a></div>"
           if open_url else "")
    )
    return _page("Linked", body)


# ---------------------------------------------------------------------------
# Adding a plan to a Canvas module or assignment (deep linking, PF-4)
# ---------------------------------------------------------------------------

_PICKER_STYLE = """
body{display:block;padding:0}main.picker{max-width:640px;margin:0 auto;text-align:left;padding:24px 16px 104px}
.picker h1{font-size:22px;margin-bottom:4px}.picker header p{margin-bottom:16px}
.search{display:block;width:100%;font:inherit;min-height:44px;padding:10px 12px;border-radius:10px;border:1px solid var(--border);
background:transparent;color:var(--fg);margin-bottom:12px}.search:focus-visible{outline:3px solid #2563eb;outline-offset:1px}
ul.plans{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.plan{position:relative}.plan input{position:absolute;opacity:0;width:1px;height:1px}
.plan label{display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid var(--border);border-radius:12px;cursor:pointer;min-height:64px}
.plan label:hover{border-color:var(--muted)}.plan input:checked+label{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary)}
.plan input:focus-visible+label{outline:3px solid #2563eb;outline-offset:2px}
.swatch{flex:none;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px}
.plan .text{min-width:0;flex:1}.plan strong{display:block;line-height:1.35;overflow-wrap:anywhere}
.plan .desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--muted);font-size:14px;margin:2px 0 0}
.plan .meta{display:block;color:var(--muted);font-size:13px;margin:4px 0 0}
.check{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid var(--border);margin-top:9px}
.plan input:checked+label .check{border-color:var(--primary);background:var(--primary);box-shadow:inset 0 0 0 4px var(--bg)}
.none{text-align:center;padding:24px 0;color:var(--muted)}
footer.bar{position:fixed;left:0;right:0;bottom:0;background:var(--bg);border-top:1px solid var(--border);padding:12px 16px}
footer.bar .inner{max-width:608px;margin:0 auto;display:flex;gap:12px;align-items:center;justify-content:flex-end}
footer.bar .chosen{flex:1;min-width:0;color:var(--muted);font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
footer.bar button{width:auto;min-width:96px}button:disabled{opacity:.5;cursor:not-allowed}
@media (max-width:480px){footer.bar .chosen{display:none}footer.bar button{flex:1}}
.empty{text-align:center;padding:48px 0}fieldset.bare{border:0;margin:0;padding:0}
"""


def _faces_css() -> str:
    from src.services.canvas.deep_linking import PLAN_FACES

    return "".join(f".f-{key}{{background:{face};color:{ink}}}" for key, (face, ink) in PLAN_FACES.items())


def _steps(count: int) -> str:
    return f"{count} step" if count == 1 else f"{count} steps"


def plan_picker(plans: list[dict], ticket: str, action: str, school: str, graded: bool = False) -> HTMLResponse:
    """Inside Canvas's add-content frame: the school's plans, one to pick. Posts the pick (or a cancel) to `action`."""
    where = "this assignment" if graded else "this module"
    if not plans:
        body = (
            "<header><h1>No plans to add yet</h1>"
            f"<p>{escape(school)} has no published plans in Life2Launch. Make or add a plan in Life2Launch, "
            "publish it, then come back and add it here.</p></header>"
            f"<form method=\"post\" action=\"{escape(action)}\">{_hidden({'ticket': ticket})}"
            "<div class=\"actions\"><button type=\"submit\" name=\"cancel\" value=\"1\">Close</button></div></form>"
        )
        return _page("Add a Life2Launch plan", f"<div class=\"empty\">{body}</div>", style=_PICKER_STYLE + _faces_css(), main_class="picker")
    items = []
    for index, plan in enumerate(plans):
        initial = escape((plan["title"][:1] or "?").upper())
        desc = f"<span class=\"desc\">{escape(plan['description'])}</span>" if plan.get("description") else ""
        search_text = escape(f"{plan['title']} {plan.get('description') or ''}".lower())
        items.append(
            f"<li class=\"plan\" data-search=\"{search_text}\">"
            f"<input type=\"radio\" name=\"plan\" id=\"p{index}\" value=\"{escape(plan['uuid'])}\" "
            f"data-title=\"{escape(plan['title'])}\">"
            f"<label for=\"p{index}\"><span class=\"swatch f-{escape(plan['color'])}\" "
            f"aria-hidden=\"true\">{initial}</span>"
            f"<span class=\"text\"><strong>{escape(plan['title'])}</strong>{desc}"
            f"<span class=\"meta\">{_steps(int(plan['steps']))}</span></span><span class=\"check\" aria-hidden=\"true\"></span></label></li>"
        )
    search = ("<input id=\"q\" class=\"search\" type=\"search\" placeholder=\"Search plans\" autocomplete=\"off\" "
              "aria-label=\"Search plans\">") if len(plans) > 5 else ""
    body = (
        "<header><h1>Add a Life2Launch plan</h1>"
        f"<p>Pick a plan for {where}. Students who open it go straight into the plan, signed in.</p></header>"
        f"<form id=\"pick\" method=\"post\" action=\"{escape(action)}\">{_hidden({'ticket': ticket})}{search}"
        f"<fieldset class=\"bare\"><legend hidden>Plans</legend><ul class=\"plans\">{''.join(items)}</ul></fieldset>"
        "<p id=\"none\" class=\"none\" hidden>No plans match. Try another word.</p>"
        "<footer class=\"bar\"><div class=\"inner\"><span id=\"chosen\" class=\"chosen\" aria-live=\"polite\">Pick a plan</span>"
        "<button type=\"submit\" name=\"cancel\" value=\"1\" formnovalidate>Cancel</button>"
        "<button id=\"add\" class=\"primary\" type=\"submit\" disabled>Add plan</button></div></footer></form>"
    )
    script = (
        "(function(){var form=document.getElementById('pick'),add=document.getElementById('add'),chosen=document.getElementById('chosen');"
        "form.addEventListener('change',function(e){if(e.target.name!=='plan')return;add.disabled=false;"
        "chosen.textContent=e.target.getAttribute('data-title')});"
        "var q=document.getElementById('q');if(!q)return;var none=document.getElementById('none');"
        "q.addEventListener('input',function(){var v=q.value.trim().toLowerCase(),shown=0;"
        "document.querySelectorAll('li.plan').forEach(function(li){var hit=!v||li.getAttribute('data-search').indexOf(v)>=0;"
        "li.hidden=!hit;if(hit)shown++});none.hidden=shown>0})})();"
    )
    return _page("Add a Life2Launch plan", body, script, style=_PICKER_STYLE + _faces_css(), main_class="picker")


def deep_link_return(return_url: str, response_jwt: str, added: str | None) -> HTMLResponse:
    """Hand the teacher's pick back to Canvas: a form posted to Canvas's return address with the signed response."""
    title = f"Adding {added}…" if added else "Closing…"
    body = (
        f"<div class=\"spinner\" aria-hidden=\"true\"></div><h1>{escape(title)}</h1>"
        f"<form id=\"go\" method=\"post\" action=\"{escape(return_url)}\">{_hidden({'JWT': response_jwt})}"
        "<noscript><button class=\"primary\" type=\"submit\">Continue</button></noscript></form>"
    )
    return _page(title, body, "document.getElementById('go').submit();", form_action=_origin_of(return_url))
