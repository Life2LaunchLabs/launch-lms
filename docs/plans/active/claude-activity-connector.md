# Design badge activities in Claude (Launch LMS connector)

## Objective

An admin designing a badge activity can do the work in Claude: Claude pulls the
current activity, renders the real learner experience inline so the admin can
click through it, edits it conversationally, and saves the result back to the
badge's draft version. Publishing stays a human action inside Launch LMS.

## Experience

1. Admin adds the Launch LMS connector in Claude (custom connector URL
   `https://<host>/api/v1/mcp`) and signs in through Launch LMS OAuth, choosing
   the organization the connector may act in.
2. "Open the Career Interests activity in the Explorer badge" → Claude lists
   badges/activities, fetches the activity document, summarizes its structure.
3. Claude calls `preview_activity`; the host renders the **same preview player
   used in the app editor** inline (MCP Apps). The admin clicks through,
   answers questions, follows branches. Flagging a page sends feedback back
   into the conversation.
4. Admin asks for changes; Claude edits the document, runs `validate_activity`
   (server validators, errors by JSON path), and re-previews the unsaved draft.
5. "Save it" → `save_activity` writes into the badge's draft version with an
   optimistic-concurrency check. Conflicts return the latest document so
   Claude can merge and retry. The response links to the in-app editor.

## Architecture

| Piece | Where | Notes |
|---|---|---|
| Activity Document v1 | `src/services/learning_documents/` | Canonical, lossless JSON for one activity: meta, settings (flow, outcomes, grading), pages with stable UUIDs, referenced variables. Pydantic models → published JSON Schema. Export/validate/apply. Also the new single-activity import/export format. |
| Concurrency | document `etag` | sha256 of the canonical document. Save requires `base_etag`; mismatch → 409 with the current document. Draft-only writes reuse `_ensure_draft`; published versions stay locked. |
| Preview engine | `src/services/learning_preview.py` | Stateless, side-effect-free runtime: grades with `_grade_answer`, routes with `resolve_flow`, returns a run-shaped object (attempts + navigation) so the learner player renders it unchanged. |
| Preview sessions | `learningactivitypreview` table | Unguessable token → document snapshot, 24h TTL. Created from a saved activity or an unsaved draft document. Token is the capability (needed because the MCP App iframe has no session cookie). |
| Learner player | `components/Learning/player/` | `LearningActivityPlayer` takes a runtime adapter (`live` = run API, `preview` = preview API). The in-app editor preview, preview links and the MCP App all mount the same `ActivityPreviewPlayer`. |
| Preview page | `app/preview/activity/[token]` | Org-themed, frameable page. Posts `launch-lms-preview` events to `window.parent` for the MCP App shell. |
| OAuth 2.1 AS | `src/services/oauth/`, `src/routers/oauth.py` | RFC 8414 metadata, RFC 9728 protected-resource metadata, RFC 7591 dynamic client registration, authorization code + PKCE (S256 only), refresh rotation, revocation. Consent page in web (`app/oauth/consent`). Tokens hashed at rest, bound to user + org + scopes + resource. |
| MCP server | `src/services/mcp/`, `src/routers/mcp.py` | Streamable HTTP (stateless JSON responses), protocol versions 2025-03-26 → 2025-11-25. Authenticates OAuth access tokens only; 401 carries `WWW-Authenticate: Bearer resource_metadata=...`. |
| MCP App | `ui://launch-lms/activity-preview` | `text/html;profile=mcp-app` shell implementing the MCP Apps handshake; it frames the preview page (declared in `csp.frameDomains`) and relays preview events as `ui/message` / `ui/update-model-context`. |

### MCP tools

| Tool | Scope | Behavior |
|---|---|---|
| `list_badges` | `activities:read` | Badges in the connected org with draft/published version summary |
| `list_activities` | `activities:read` | Activities in a badge version (default: newest draft, else active) |
| `get_activity` | `activities:read` | Activity Document + `etag` + editability |
| `get_activity_schema` | `activities:read` | JSON Schema + authoring guide (also a resource) |
| `validate_activity` | `activities:read` | Dry-run all server validators, no writes |
| `preview_activity` | `activities:read` | Creates a preview session (saved or draft document) → inline MCP App + link |
| `save_activity` | `activities:write` | Replace an activity in a draft version (`base_etag` required) |
| `create_activity` | `activities:write` | Add a new activity to a draft version from a document |
| `list_variables` | `activities:read` | Org learning variables usable in flows/bindings |

Deliberately absent: publish, delete, awards, learner data.

## Acceptance criteria

- [ ] Activity Document round-trips losslessly (export → apply → export is identical apart from etag-neutral fields), including branching flow, outcomes, variants and button destinations.
- [ ] Validation reports every problem with a JSON path; save rejects invalid documents and published versions.
- [ ] Concurrent edit returns 409 with the current document.
- [ ] Preview engine follows branching flow identically to the live runtime and never writes progress, attempts, variables or portfolio outcomes.
- [ ] In-app editor preview, preview links, and MCP App preview mount the same player component.
- [ ] OAuth: DCR, PKCE S256 required, codes single-use and short-lived, refresh rotation, revocation, consent requires org admin.
- [ ] MCP: initialize/tools/resources over Streamable HTTP; unauthenticated requests get spec-compliant 401 discovery.
- [ ] Single-activity JSON import/export in the activity editor using the document format.
- [ ] Nginx/infra exposes `/.well-known/oauth-*` (verify on life2launch.dev).
- [ ] Owner test in Claude against life2launch.dev.

## Phases and progress

1. **Activity Document + schema + document API** — done
2. **Preview engine + preview sessions + shared player** — done (browser verification pending)
3. **OAuth 2.1 authorization server + consent UI** — done (browser verification pending)
4. **MCP server + tools** — not started
5. **MCP App inline preview** — not started
6. **Editor import/export on the new format** — not started
7. **Deploy wiring + live verification in Claude** — pending (needs deploy)

## Decisions

- Activity-level etag rather than the version `revision`: every edit in a draft bumps the
  version revision, so using it would raise false conflicts when someone edits a
  different activity in the same draft.
- Preview tokens are bearer capabilities (24h) instead of cookie auth so the preview
  works in Claude's sandboxed iframe and as a shareable link. Previews are read-only and
  never touch learner records.
- OAuth tokens are accepted only by the MCP endpoint (audience-bound), not by the
  general REST API, which keeps the blast radius of a connector token small.
- Hand-rolled MCP JSON-RPC handler (≈ tools + resources) instead of adding the Python
  SDK: small surface, full control over auth and MCP Apps metadata, no new dependency.
- Client ID Metadata Documents (MCP 2025-11-25) are a follow-up; DCR covers Claude today.

## Verification

- `TESTING=true uv run pytest src/tests/test_learning_documents.py src/tests/test_learning_preview.py src/tests/test_oauth.py src/tests/test_mcp.py`
- `./scripts/agent check --changed`
- Manual: add custom connector in Claude → sign in → "list my badges" → preview → edit → save.

## Recovery

All new tables are additive (`oauthclient`, `oauthauthorizationcode`, `oauthtoken`,
`learningactivitypreview`); downgrade drops them. The connector can be disabled by
setting `LAUNCHLMS_MCP_ENABLED=false`, which makes the MCP and OAuth endpoints
return 404 without touching existing behavior.
