"""MCP App (SEP-1865) view for inline activity previews.

The view is a thin shell: it performs the MCP Apps handshake with the host,
waits for the preview_activity tool result, and frames the real Launch LMS
preview page (the same page and player admins see in the app). Notes the admin
writes in the preview become chat messages, and their path through the
activity is shared with the model as context.
"""

from __future__ import annotations

import json
from urllib.parse import urlparse

from src.services.oauth.config import frontend_url

PREVIEW_APP_URI = "ui://launch-lms/activity-preview"
APP_MIME_TYPE = "text/html;profile=mcp-app"

_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Launch LMS preview</title>
<style>
  :root { color-scheme: light dark; font-family: var(--font-sans, system-ui, -apple-system, sans-serif); }
  html, body { margin: 0; height: 100%; background: transparent; }
  #shell { display: flex; flex-direction: column; height: 720px; }
  #bar { display: flex; align-items: center; gap: 8px; padding: 6px 4px; font-size: 12px; color: var(--color-text-secondary, #666); }
  #bar .spacer { flex: 1; }
  #bar button { font: inherit; font-size: 12px; border: 1px solid var(--color-border-primary, #ddd); background: var(--color-background-primary, #fff); color: var(--color-text-primary, #222); border-radius: 8px; padding: 4px 10px; cursor: pointer; }
  #frame { flex: 1; width: 100%; border: 0; border-radius: 12px; background: #f4f4f5; }
  #status { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; font-size: 14px; color: var(--color-text-secondary, #666); }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div id="shell">
  <div id="bar"><span id="title">Launch LMS preview</span><span class="spacer"></span>
    <button id="open" type="button" hidden>Open in new tab</button>
    <button id="full" type="button" hidden>Full screen</button></div>
  <div id="status">Preparing preview…</div>
  <iframe id="frame" title="Activity preview" hidden allow="clipboard-write"></iframe>
</div>
<script>
(() => {
  const PREVIEW_ORIGIN = __PREVIEW_ORIGIN__;
  const frame = document.getElementById("frame");
  const statusEl = document.getElementById("status");
  const titleEl = document.getElementById("title");
  const openButton = document.getElementById("open");
  const fullButton = document.getElementById("full");
  let nextId = 1;
  let previewUrl = null;
  let activityTitle = "";
  const pending = new Map();
  const trail = [];

  function send(message) { window.parent.postMessage({ jsonrpc: "2.0", ...message }, "*"); }
  function request(method, params) {
    const id = nextId++;
    send({ id, method, params });
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  function notify(method, params) { send({ method, params }); }

  function showPreview(result) {
    const data = (result && result.structuredContent) || {};
    if (!data.embed_url) {
      const text = ((result && result.content) || []).map((item) => item.text || "").join(" ");
      statusEl.textContent = text || "No preview was returned.";
      return;
    }
    if (new URL(data.embed_url).origin !== PREVIEW_ORIGIN) {
      statusEl.textContent = "Preview link is not from this Launch LMS site.";
      return;
    }
    previewUrl = data.preview_url;
    frame.src = data.embed_url;
    frame.hidden = false;
    statusEl.hidden = true;
    openButton.hidden = false;
  }

  function shareTrail() {
    const lines = trail.slice(-25).map((step, index) => `${index + 1}. ${step}`);
    request("ui/update-model-context", {
      content: [{ type: "text", text: `The admin is testing the preview of "${activityTitle}". What they did so far:\\n${lines.join("\\n")}` }],
    }).catch(() => {});
  }

  function describeAnswer(answer) {
    try { return JSON.stringify(answer).slice(0, 300); } catch (_) { return ""; }
  }

  function onPreviewEvent(event) {
    if (!event || !event.type) return;
    if (event.type === "ready") {
      activityTitle = event.activity_title || "";
      titleEl.textContent = `Preview · ${activityTitle}`;
    } else if (event.type === "page_viewed") {
      trail.push(`Viewed page "${event.page_title}"`);
    } else if (event.type === "answer_submitted") {
      trail.push(`Answered "${event.page_title}": ${event.answer_summary || describeAnswer(event.answer)}`);
      shareTrail();
    } else if (event.type === "finished") {
      const result = event.run && event.run.result;
      trail.push(result && result.max_score > 0 ? `Finished (${result.passed ? "passed" : "not passed"}, ${result.score_percent}%)` : "Finished the activity");
      shareTrail();
    } else if (event.type === "restarted") {
      trail.push("Restarted the preview");
    } else if (event.type === "error") {
      trail.push(`Got an error on "${event.page_uuid}": ${event.message}`);
      shareTrail();
    } else if (event.type === "feedback") {
      request("ui/message", {
        role: "user",
        content: { type: "text", text: `Preview note on page "${event.page_title || "this page"}" (${event.page_uuid || "unknown page"}): ${event.text}` },
      }).catch(() => {});
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source === frame.contentWindow) {
      if (event.origin === PREVIEW_ORIGIN && event.data && event.data.type === "launch-lms-preview") onPreviewEvent(event.data.event);
      return;
    }
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.id !== undefined && pending.has(message.id) && !message.method) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(message.error) : resolve(message.result);
      return;
    }
    if (message.method === "ui/notifications/tool-result") showPreview(message.params);
    else if (message.method === "ui/notifications/tool-cancelled") statusEl.textContent = "Preview cancelled.";
    else if (message.method === "ui/resource-teardown" && message.id !== undefined) send({ id: message.id, result: {} });
    else if (message.id !== undefined && message.method) send({ id: message.id, error: { code: -32601, message: "Method not found" } });
  });

  openButton.addEventListener("click", () => previewUrl && request("ui/open-link", { url: previewUrl }).catch(() => window.open(previewUrl, "_blank")));
  fullButton.addEventListener("click", () => request("ui/request-display-mode", { mode: "fullscreen" }).catch(() => {}));

  request("ui/initialize", {
    protocolVersion: "2026-01-26",
    appInfo: { name: "Launch LMS activity preview", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
  }).then((result) => {
    const modes = (result && result.hostContext && result.hostContext.availableDisplayModes) || [];
    fullButton.hidden = !modes.includes("fullscreen");
    notify("ui/notifications/initialized", {});
    notify("ui/notifications/size-changed", { width: document.body.scrollWidth, height: 760 });
  }).catch(() => { statusEl.textContent = "This Claude client could not start the preview."; });
})();
</script>
</body>
</html>
"""


def preview_origin() -> str:
    parsed = urlparse(frontend_url())
    return f"{parsed.scheme}://{parsed.netloc}"


def preview_app_html() -> str:
    return _HTML.replace("__PREVIEW_ORIGIN__", json.dumps(preview_origin()))


def preview_app_meta() -> dict:
    origin = preview_origin()
    return {"ui": {"csp": {"frameDomains": [origin], "resourceDomains": [origin]}, "prefersBorder": False}}
