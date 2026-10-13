# Learner polish implementation and verification

Date: 2026-10-12. Selected direction: [owner-approved proposal](learner-polish-proposal-2026-10-12.md), based on the owner's Plans screenshot and requested changes. This is an implementation report, not a newly approved screenshot baseline. Owner review of the implementation remains pending.

## Implementation

- Discover uses the adopted wrapper and page header, theme-aware controls, manual featured selectors, a single quiet challenges mention, and explicit browse/resume action language. Featured content grows for long titles; large artwork is reserved for sufficiently wide containers. In-progress and series shelves avoid the extra duplicate More badges shelf.
- My plans removes the empty header spacer, shrinks the weekly summary and step cards, and removes the competing decorative play tile. The overview rail aligns below the header, contains active plans and creation links, and independently expands completed plans at its bottom. Future groups use disclosures; Next week starts open.
- Plan details have a deterministic My plans return, no management rail, a progress/sharing header, a compact plan picker, and capability-controlled detail editing with Save/Cancel. Step-order edits participate in that save. Editing an undated personal plan now follows creation’s optional-date rule; supplied dates still respect bounds. Completion copy no longer promises an unimplemented portfolio milestone.
- Effective API permissions lock system starter and badge-issued definitions, including existing owner and delegated administrator roles. Organization-assigned definitions are restricted for learner actors; personal/adaptable plans retain their authority. Sharing, progress, and reviewer access remain available. The API's role presentation applies the same source policy.
- Hub has a centered full workspace, five discrete recents below What to do next, and inline older history. Memory uses a local draft, left-side switch, and right-side Save; saving acknowledges the notice even when the choice is unchanged. Failed saves or dismissals do not silently acknowledge it. Existing organization/user scoping is preserved.
- News and Store use adopted headers; News returns have an explicit destination. Auth accepts the existing next/redirect conventions. The owner achievement listing redirects to the canonical Portfolio Badges view while legacy award detail/verification links remain intact. Project creation is labelled Save project.
- Existing ContentPageHeader has a destination prop, catalog documentation, and a native preview. Quality scanners prune generated/dependency directories while preserving their source rules and debt ceilings.

## Environment and fixtures

The owner authorized local test-account creation. A synthetic learner was created through the normal signup flow and received Launch Ready. Credentials and browser storage are private temporary files, excluded from this report. The supplied local site was used at `https://172.29.23.169.sslip.io:3000/`.

An isolated frontend is used for final captures because mounted-workspace hot reload did not reliably show subsequent file changes. It uses Turbopack, the local TLS certificates and an isolated build directory. Final planning interaction checks route browser requests to an isolated API process running the current source against the same local database; runtime domain aliases are normalized to the preview origin in the browser harness. Initial cold compilation and stale generated Next type files required retries. Generated files were removed rather than weakening type checks.

The local Discover catalog is empty. Populated Discover and Hub history captures use explicitly synthetic browser response fixtures; these exercise the rendered layout and controls, not catalog persistence or conversation creation. The starter plan, sharing modal, navigation, memory writes, and signup use the actual local API.

## Browser evidence

Chromium with Playwright; light and dark themes; desktop 1440×900, wide 1800×1000, tablet 900×900 and phone 390×844. Selected reference version: the approved 2026-10-12 proposal plus adopted catalog components and the owner's current-state screenshot. Implementation: local working tree based on `b9bbdcf7`. Core Plans/Badges/Hub source and planning-service SHA256: `89f87191aedc66594e5477022b0a4656dc9909382ed3be02cc56e189697d9cbe`.

Retained captures were visually inspected against that direction:

| Surface/state | Capture | Finding |
| --- | --- | --- |
| Plans desktop and phone | [Desktop](learner-polish-2026-10-12/plans-desktop.png), [phone](learner-polish-2026-10-12/plans-phone.png) | Normal header spacing, smaller cards, single Start action, aligned rail |
| Hub companion on wide Plans | [Companion](learner-polish-2026-10-12/plans-companion-wide.png) | Responsive plan picker and usable companion; keyboard resize exercised |
| Completed plans and load failure | [Completed disclosure](learner-polish-2026-10-12/plans-completed-expanded.png), [failure](learner-polish-2026-10-12/plans-load-failure.png) | Active plans remain visible; weekly failure offers recovery |
| Plan detail and sharing | [Desktop](learner-polish-2026-10-12/plan-detail-desktop.png), [dark phone](learner-polish-2026-10-12/plan-detail-phone-dark.png), [modal](learner-polish-2026-10-12/plan-sharing.png), [avatars](learner-polish-2026-10-12/plan-shared-avatars.png) | Deterministic return, no management rail, thin sharing row; avatar fixture opens modal |
| Populated Discover | [Desktop](learner-polish-2026-10-12/discover-populated-desktop.png), [dark phone](learner-polish-2026-10-12/discover-populated-phone-dark.png), [series selection](learner-polish-2026-10-12/discover-collection-desktop.png) | Long titles fit; artwork does not compete on narrow containers; manual controls and themed chrome |
| Hub layout/history/memory | [Desktop](learner-polish-2026-10-12/hub-desktop.png), [expanded history](learner-polish-2026-10-12/hub-history-expanded.png), [phone notice](learner-polish-2026-10-12/hub-phone-notice.png) | Navigation sits beside centered content; history expands inline; memory has explicit Save |

Browser scenarios and results:

- Normal signup reaches welcome and creates an authenticated synthetic learner with Launch Ready.
- Launch Ready hides definition editing, opens the existing sharing dialog, and returns to My plans. A live attempted step-order mutation returns 403.
- Phone Your plans opens the picker and selecting Launch Ready opens its detail.
- A disposable personal plan exercises draft edits without auto-saving, Cancel, Save, optional target date, and opening rule. Completing it reveals the completed-plan disclosure while Launch Ready remains active. The disposable plan is deleted after the test.
- A simulated weekly-feed 503 shows the specific load failure; restoring the API and clicking Try again recovers.
- Hub history expands and collapses inline. Companion keyboard ArrowLeft increases its width.
- Memory toggle changes a draft. A simulated 503 on Save retains the notice and shows an error; retry against the real API succeeds. The notice stays absent after reload and a fresh `/login?next=/hub` login.
- No document-level horizontal overflow in the checked Plans/detail/Hub and populated Discover states. Shelves/selectors retain intended local scrolling.

Visual inspection caught and corrected long-title clipping/art overlap in Discover and excessive separation between Hub navigation and content. Final captures include the density, sharing-row and centered Hub refinements. Some earlier desktop captures retain “1 steps”; refreshed phone and companion captures verify the final singular copy. Final narrow companion verification also confirms Save stays right-aligned when its action row wraps. The development HUD is visible in captures and is not product chrome. There are no owner-accepted deviations recorded; owner review remains pending.

Commands used: temporary Playwright scripts `learner-polish-ui-final.cjs`, `learner-polish-discover-final.cjs`, `learner-polish-plan-flow.cjs`, `learner-polish-responsive-final.cjs`, `learner-polish-avatars.cjs`, `learner-polish-responsive-refresh.cjs`, plus the memory/relogin scripts, run with Node 24 and the installed Chromium. Temporary authentication files are intentionally not retained as artifacts. Populated Discover, history and collaborator avatars use synthetic response fixtures; no invitations were sent.

## Automated checks

- Focused starter, planning, and badge route tests: 49 passed, including the optional-date regression.
- Memory and portfolio tests: 24 passed.
- Frontend unit suite: all seven files passed.
- Frontend debt-ratchet lint: passed without growth (313 pre-existing errors, 44 warnings); affected components also checked directly.
- Explicit-source frontend TypeScript check: passed after the final Discover refinement.
- Final `./scripts/agent check --all`: passed after the optional-date regression. API: 640 passed, nine skipped, one expected failure (98.25 seconds). Documentation, product-map validation/render, source-size policy, architecture policy, frontend lint/typecheck/unit suites, and Ruff all passed. Frontend unit runners cover seven files, including 62 navigation/request-policy tests.
- `AGENT_BASE_REF=HEAD ./scripts/agent check --changed`: passed; API 640 passed, nine skipped, one expected failure (131.96 seconds).
- `git diff --check` and final documentation validation: passed. Final narrow memory-action alignment also passes targeted ESLint.

## Review limits and owner scenarios

The existing organization scoping can still show a memory notice in a different organization. Reload persistence is verified; the original report of recurrence across every login is not attributed to a single proven root cause. Failures now remain visible instead of being swallowed.

Review My plans density, Launch Ready sharing and back navigation, Discover carousel selectors, and Hub history placement on desktop and phone. For a personal plan, open Details, change the goal/date/opening rule, cancel, then save and reload. Overlapping avatars were verified with synthetic display data; check actual collaborator names and images during owner review. Broader role/tenant/browser combinations from the proposal remain separate from these representative captures; this report does not claim an exhaustive visual audit of every permission state.

There is no assigned BOT key in this conversation. This local report preserves evidence without posting to an unrelated issue or changing historical owner signoff. No PR, merge or deployment was performed. The original local development server was retained; isolated verification processes were stopped and its public runtime configuration restored. Restart the development server to pick up refinements missed by mounted-workspace hot reload.
