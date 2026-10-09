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

- [x] Activity Document round-trips losslessly (export → apply → export is identical apart from etag-neutral fields), including branching flow, outcomes, variants and button destinations.
- [x] Validation reports every problem with a JSON path; save rejects invalid documents and published versions.
- [x] Concurrent edit returns 409 with the current document.
- [x] Preview engine follows branching flow identically to the live runtime and never writes progress, attempts, variables or portfolio outcomes.
- [x] In-app editor preview, preview links, and MCP App preview mount the same player component.
- [x] OAuth: DCR, PKCE S256 required, codes single-use and short-lived, refresh rotation, revocation, consent requires org admin.
- [x] MCP: initialize/tools/resources over Streamable HTTP; unauthenticated requests get spec-compliant 401 discovery.
- [x] Single-activity JSON import/export in the activity editor using the document format.
- [ ] Nginx exposes `/.well-known/oauth-*` (config added; verify on life2launch.dev).
- [ ] Owner test in Claude against life2launch.dev.

## Phases and progress

1. **Activity Document + schema + document API** — done
2. **Preview engine + preview sessions + shared player** — done
3. **OAuth 2.1 authorization server + consent UI** — done
4. **MCP server + tools** — done
5. **MCP App inline preview** — done (verified against a simulated MCP Apps host; needs a real Claude client)
6. **Single-activity JSON import/export on the new format** — done
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

Automated: `TESTING=true uv run pytest src/tests/test_learning_documents.py src/tests/test_learning_preview.py src/tests/test_oauth.py src/tests/test_mcp.py`
(plus the full API suite, ruff, web typecheck/lint and the repo policy checks).

Local end-to-end run (PostgreSQL 16 + pgvector, Redis, API, production `next build`/`next start`, Chromium):

- Migrations `k1p2r3v4w5x6` and `k2o3a4u5t6h7` upgrade, downgrade and re-upgrade; `alembic check` reports no drift.
- Live OAuth + MCP script: metadata, 401 discovery, DCR, consent validate/decide, PKCE code exchange,
  initialize, tools/list, list_badges, list_activities, get_activity, validate_activity,
  preview_activity, app resource, save_activity, stale save (409), refresh rotation, revocation.
- Browser: editor Preview follows both branches and shows the route summary; shared preview link renders
  logged-out at desktop and 390px; MCP App shell in a simulated host completes `ui/initialize`, frames the
  preview, sends `ui/update-model-context` (readable answers) and `ui/message` for notes; consent page
  redirects with `code`, `state` and `iss`; learning-path JSON export then import creates a copy; learner
  run completes on the published version; a draft cloned from it keeps answer-based branching.

Still to do: add the connector in a real Claude client against life2launch.dev.

## Fixed along the way

- Draft cloning left answer-based branch conditions (`<page_uuid>.result…`) pointing at the published
  version's pages, so branching silently fell back to the default path in every new draft; page lineage
  was overwritten with the new page's own uuid, breaking the version diff.
- Learner player: on a fresh run the first answer resolved the next page against the stale page list,
  skipping a page on branching activities.
- Editor preview walked pages linearly and ignored the flow.

## Ecosystem refactors (after the connector)

| # | Change | Commit |
|---|---|---|
| R4 | Launch Ready system activities are data (`learning_system/launch_ready.json`, seed vs managed sync policy) | `1bf4cb7` |
| R5 | `services/learning.py` split into the `services/learning/` package | `f3b6c6f` |
| R3 | Question settings live only on blocks (migration `k3n4o5r6m7q8`); legacy fallbacks removed; collection zips use Activity Documents | `2a3f99b` |
| R7 | Buttons are `continue` (routed by flow edges on `<page>.button`) or `revisit` (migration `k4b5u6t7t8n9`) | `996d9cc` |
| R1/R2 | Runtime is server-authoritative: no run definition snapshot, navigation + result for every activity, player only renders; dead `editable` player mode removed | `13a50c1` |
| R8 | `LearningActivity.published` is system-only visibility (no-op Publish button removed); Preview works on published versions; `LAUNCHLMS_SSL`/bool env parsing fixed | `13a50c1` |
| R6 | Typed content models (`services/learning_content`) drive page validation, the published JSON Schema and generated TS types (`content.generated.ts`) | `59a162a` |

Content saved before the models tightened never blocks anyone: learners are unaffected (the
runtime does not validate), saves only reject issues an edit *introduces* (issues the stored page or
flow already had are carried and returned as warnings, for the page API, activity settings, document
saves from Claude and previews), the editor lists them in a banner, and **Repair** applies the
mechanical fixes after showing them (drafts only); anything needing a decision, such as an unknown
block type, stays listed. `uv run python cli.py audit-learning-content` reports the same issues
across a whole database.

Verified locally on PostgreSQL: both data migrations upgrade a pre-R3 database (4 legacy buttons
became revisits), every stored page and flow passes the models, and in Chromium a share-link preview
routes "Learn more" / "Skip ahead" through flow edges and "Back to start" revisits; the editor shows
the button action picker and a "Button pressed" branch; published versions open Preview.

## Follow-ups

- Client ID Metadata Documents; a "Connected apps" screen over `/api/v1/oauth/connections`.
- Allow `video` pages' media and image uploads to be added from Claude (`import_media`).

## Recovery

All new tables are additive (`oauthclient`, `oauthauthorizationcode`, `oauthtoken`,
`learningactivitypreview`); downgrade drops them. The connector can be disabled by
setting `LAUNCHLMS_MCP_ENABLED=false`, which makes the MCP and OAuth endpoints
return 404 without touching existing behavior.
