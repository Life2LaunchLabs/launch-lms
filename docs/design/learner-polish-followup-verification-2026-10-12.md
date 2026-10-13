# Learner polish follow-up verification

Date: 2026-10-12. Reference: [owner follow-up brief](learner-polish-followup-2026-10-12.md), the conversation's charcoal swatch and Epic Games hero/side-selector composition. This supersedes the earlier compact Discover direction. Owner review remains pending; captures are implementation evidence, not an approved baseline.

## Implementation

Primary learner pages share a 1600px outer frame. Optional rails consume space inside it, keeping navigation anchored. Hub home and composer start at the shared content edge. Default dark background uses charcoal, with slightly raised card/popover surfaces.

Plans replaces My plans throughout primary navigation and related destination copy. The overview rail restores color/progress-filled selectors. Plan details restore the full color identity/progress header, followed by compact borderless sharing. Create your own immediately persists an undated personal plan and opens header editing; Save updates it and Cancel discards subsequent edits. Existing source permissions and the Hub-assisted creation flow remain intact.

Discover retains a large image-led hero. Desktop selectors sit to its right; smaller containers use horizontal scrolling. Challenges coming soon returns as a slide without an action button or duplicate banner. The empty catalog retains welcome/challenges slides. Badges → Discover carousel lets authorized organization administrators select automatic or curated content, reorder up to six slides, set copy/artwork, and enable/disable the hero. Settings use the existing organization JSON; no migration is required. Draft/unavailable sources are excluded, and unsafe destination/artwork URLs are rejected. Session refresh preserves unsaved editorial changes.

## Environment and evidence

Local working tree on `ccr-ae46023d-f9dh4k`, base `b9bbdcf7`; no commit, push, merge or deployment. Private disposable learner credentials/browser storage stay in `/tmp`. Existing local admin is used for configuration verification, with original settings restored after each attempt. Disposable personal plans are removed afterward.

Chromium via Playwright, local HTTPS preview at port 13100, isolated `.next-ui-test` generated directory. The initial preview served cached old dark CSS despite changed source; its generated cache was cleared before final color verification. The original API stopped during verification; a temporary API bound to localhost uses the retained development database configuration. Runtime domain aliases are normalized to the preview origin by the browser harness.

At 1440×900 and 1800×900, the Plans navigation link had identical bounds across Plans, Discover, Portfolio and Hub:

| Viewport width | x | y | width | height |
| --- | --- | --- | --- | --- |
| 1440 | 40 | 390 | 232 | 44 |
| 1800 | 140 | 390 | 232 | 44 |

All eight desktop captures had no horizontal document overflow. Live starter-plan details hid definition editing, opened sharing, and returned to Plans. Create your own opened the header Goal editor directly; Save persisted the new name, removed the edit query, and Cancel restored the saved values. API cleanup returned 200.

Final browser results: the dark canvas computes to `rgb(25, 26, 26)` (`#191a1a`) on desktop and phone. All final captures have no horizontal document overflow. Collapsed primary links remain at x=24, y=390, width=44, height=44 across actual clicks among Discover, Portfolio, Hub and Plans at 1440×900. Tablet 900×900 and phone 390×844 preserve the plan picker, full color detail header and compact sharing. A simulated create failure shows its error and leaves the overview available.

Real administrator settings save, reordering, editor reload and learner rendering passed. The custom story and Challenges coming soon slide both render from saved configuration. Original settings were restored (200). The local catalog is empty; populated badge/series and long-title captures use clearly synthetic browser response fixtures, while configuration persistence and plan interactions use the actual API.

Retained captures: 28 images in the [evidence directory](learner-polish-followup-2026-10-12/). Inspection covered desktop Plans/Hub/Discover/Portfolio, colored plan detail, sharing, new-plan header editor, challenges dark desktop/phone, populated badge and series art, long titles, admin editor top/footer and responsive plan states. The large hero/vertical-selector composition and charcoal canvas match the owner's supplied direction; phone selectors scroll within their own row. No owner-accepted deviations are recorded. The admin fixture references a missing local avatar file; that fixture limitation is visible in admin captures and does not affect the carousel flow.

Core implementation source SHA256: `00c62ad878f262122e30aca423bbc2ced56863ccb708e1a8f05c620f8d98b5c0`.

## Commands

- `AGENT_BASE_REF=HEAD ./scripts/agent check --changed`: documentation, product map, source/architecture policies, lint, TypeScript and unit checks passed; the sandbox API harness stalled. Full checks run outside the sandbox supply final API evidence.
- `uv run pytest src/tests/test_discover_featured.py src/tests/test_badge_discover.py -q`: 13 passed in 24.81s; ordering, overrides, disabled state, tenant/admin authorization, draft filtering, unsafe URLs, empty catalog and removed-source recovery.
- `./scripts/agent check --all`: passed. Lint ratchet: 313 known errors and 44 known warnings, no growth. Native Next type generation and TypeScript passed; frontend unit suite 62 passed. Ruff passed; API suite 651 passed, 9 skipped, 1 expected failure in 81.69s. Product-map and architecture checks passed. Final documentation recheck: 27 Markdown files valid. Source-size policy: 81 grandfathered files, with the PlansWorkspace ceiling tightened to 932 lines after extracting its color hook. `git diff --check` passed.
- Browser harnesses: `/tmp/learner-followup-browser.cjs` and private `/tmp/learner-followup-admin.cjs`, run with Node 24 and the local Chromium executable. Runtime configuration aliases are test-only; no production settings are weakened.

## Owner test steps

Switch among Hub, Plans, Discover and Portfolio at desktop width, then collapse navigation and repeat. Check the dark canvas against the supplied swatch. Open an existing plan, try sharing, and use the back arrow. Choose Create your own, edit the header, Save, reopen Details and Cancel an edit. In admin Badges, open Discover carousel, curate a custom story plus Challenges coming soon, change their order and Save. Reload Discover and choose both slides, then check phone layout. Owner signoff and delivery remain pending.
