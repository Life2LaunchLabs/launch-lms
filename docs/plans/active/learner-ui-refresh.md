# Learner UI refresh: coach shell, Plans landing, Discover, Portfolio

Date: 2026-10-13. Status: **approved 2026-10-13, in progress** (single PR, one commit per step). Base: `dev` at `a457833`.
The branch `claude/ui-dark-mode-polish-l6ybmx` also carries `b483fcf` (dark default,
plan carousel, step path, Discover tiles); see Phase 0 for what happens to it.

## Objective

Make the learner side feel like one bright, intentional product rather than a set
of pages with a chat bolted on, and refactor the code underneath to match, not
paint over it:

- **Plans is home.** The app opens on Plans. Steps read as a path: done, here,
  open, locked.
- **The coach lives at the edge of the app**, not on its own page. One nav item
  pulls it out; once a conversation exists its edge stays visible.
- **Discover holds everything to start**: badges (each badge starts a plan) and
  resources, with search as the primary action.
- **Portfolio is a profile**: bio first, sections that open their own pages, no tabs.
- **Dark by default**, blue-slate base, color used inside bounded shapes, one
  pressable component language.

## Direction and references

Owner conversation 2026-10-13 (this session). Selected reference: the prototype canvas
<https://claude.ai/artifact/Rt2QXHSELUQcAQ1gATs6jc> (private to the owner until shared).
Duolingo dark mode screenshots supplied in the conversation are inspiration for color,
state legibility and minimal carousels only; nothing proprietary is copied.

Artboards and their status:

| Artboard | Status |
| --- | --- |
| Plan · phone, Plan · edit mode, Plan · desktop | Approved direction |
| Discover · badges, plans and resources | Approved with amendments A3–A5 |
| Portfolio profile · phone | Approved with amendment A7 |
| Refined components | Approved as the component kit |
| Coach · phone 1–3, Coach · desktop, edge | Approved with amendments A1–A2 |

Owner amendments made after the prototype (they win over the artboards):

- **A1 Coach motion.** The chat surface moves *with* the page: when the page slides back,
  the chat slides right off-screen under the page and fades to transparent, as if it is
  still there. It does not sit fixed under the content. Margins between page card,
  outside surface and nav are equal on all sides.
- **A2 No Hub page.** The coach exists only in the side surface. Hub's "what to do next"
  and launch cards become the coach's pre-conversation home.
- **A3 Discover search.** A full-width search bar sits at the very top (phone at least),
  with a filter button to its right that opens filter options. Filter chips appear only
  when filters are applied. Search results are their own view, not a filtered feed,
  because most content is otherwise tucked in carousels.
- **A4 Discover order.** Resources sit under plans, as carousels grouped by type.
- **A5 Hero autoplay.** The hero advances on a timer, shown by a segmented bar under it
  (one segment per slide; the active one fills).
- **A6 Landing.** Plans replaces Hub as the page the app opens on.
- **A7 Portfolio.** The prototype's stat overview is replaced by the bio.

Superseded earlier direction (docs/design/learner-polish-followup-2026-10-12.md): the
charcoal `#191a1a` dark canvas, Hub as the primary/landing destination, "keep existing
companion resizing and phone overlays" (phone overlay is replaced; desktop resizing is
kept, see D6), and the full Hub page. BOT-82's three presentation states (full, companion,
launcher) become two: **open** and **edge**, plus **closed**.

## What exists today (source findings)

Shell and nav
- `app/orgs/[orgslug]/(withmenu)/layout.tsx` wraps authenticated pages in `HubWorkspace`
  and renders `OrgMenu`, page content and a portal target `#org-layout-right-sidebar`
  (280px rail; Plans uses it for `PlansOverviewPanel`).
- `components/Hub/HubWorkspace.tsx` (182 lines) already renders the conversation as a
  stable sibling of routed content with three modes: full (`/hub`), companion (inset app
  frame plus resizable panel on ≥1200px; focus-trapped fixed overlay below) and closed
  with the floating **Continue with Hub** pill. `components/Hub/workspace.css` holds the
  frame styles. `HubWorkspaceContext` carries surface hints, edit runs, edit operations,
  review items and continuations (BOT-82/BOT-163 contracts).
- `components/Objects/Menus/OrgMenu.tsx` (519, in the size baseline) renders the desktop
  sidebar (collapsible, `compact` when companion is open) and the phone bottom bar with
  a **More** menu (Account, Help/feedback, Messages with unread count).
  `OrgMenuLinks.tsx` lists Hub, Plans, Discover (`/badges`), Portfolio, News.
- Landing: `(withmenu)/page.tsx` redirects signed-in users to `/hub`;
  `services/routing/requestPolicy.ts` has `getHubRedirectDestination`; demo users default
  `start_path` to `/hub` (`services/demo/demo.ts`, `Demo/Studio/StudioNewUser.tsx`
  `START_PAGES`); `Landings/quickstartConfig.ts` and `Onboarding/DashboardOnboardingBanner.tsx`
  link to Hub.

Hub
- `(withmenu)/hub/` is 19 files, 3,116 lines. `HubExperience.tsx` (1,066, size baseline)
  carries both full and companion modes: view switch (`ask`/`resources`), home stack,
  recents, edit-run timeline, suggested actions, memory notice, attach menu, resource
  library/tray/carousel, quick search.
- Resources only live inside Hub: `/resources`, `/resource/[uuid]` and `/search` all
  redirect to `/hub?...` (`hubFromLegacyResources`, `hubFromLegacySearch`,
  `routePaths.org.resource()` → `/hub?resource=`). Resource detail is the tray's
  `ActiveResourceWorkspace` (notes, comments, reviews, save).
- `HubHomeStack` (next actions via `/hub/next-actions`, falls back to `HubLaunchCards`
  from platform settings) and `HubHomeRecents` render only in full mode.
- Backend `services/hub_actions.py` `NAVIGATION_DESTINATIONS` includes `hub` (`/hub`) and
  a stale `programs` (`/programs`, route no longer exists on `dev`).

Plans
- `components/Plans/PlansWorkspace.tsx` (932, size baseline) owns routing state, the
  legacy `PlanEditor` (drag-and-drop with virtual "Right now"/"Completed" sections),
  Hub agent proposals (`ProposedPhaseEditor`, `ProposedObjectiveEditor`), `ObjectiveCard`
  (fields, notes, completion, review), helper `Feed`, `CreatePlanEditor` and `PlanStructure`.
- `learner/` holds the newer learner views: `PlansHome` (weekly focus from
  `/planning/home`), `PlanView`, `StepStack`, `PlanHeaderActions`, `PlansOverviewPanel`,
  `usePlanColors` (per-browser colors, `setPlanColor` exists but no UI), `useQuickCreatePlan`.
- Dead in `PlanEditorShared.tsx`: `PlanWorkspaceHeader`, `planTargetDateLabel`,
  `PlanObjectiveDefinitionCardLegacy` (no importers). Admin uses
  `PlanObjectiveDefinitionCard`, `PlanPermissionChecklist`, `PersonAvatar`, `StepTypeIcon`.
- Plan templates are admin-only (`/planning/templates*`); `services/own_plans.plan_from_template`
  already creates a learner plan from a template; badges start plans via
  `POST /badges/{uuid}/start-plan`.

Discover
- `/badges` renders `BadgeDiscoverPage` → `discover/DiscoverFeed`, `DiscoverHero`,
  `BadgeArt` (tiles, shelves, headings). Backend `services/badge_discover.py` and
  `discover_featured.py` build cards, collections, keep-going and hero slides (badge,
  collection, news, link, challenges) with org settings edited in `DiscoverSettingsPanel`.
- `/search/org_slug/{slug}` returns badges, collections, communities, organizations,
  resources, channels and users; the web client `searchOrgContent` has **no callers**.

Portfolio
- `components/Pages/Portfolio/PortfolioShell.tsx` (765, size baseline) uses
  `TabbedPageHeader` with Overview/Timeline/Projects/Badges/Resume tabs swapped
  client-side via `pushState`. Overview is an owner-ordered list of sections
  (`about` = `short_bio`, featured badges, traits, timeline, projects, socials).
  Detail routes already exist (`/portfolio/timeline`, `/projects`, `/badges`, `/resume`).
- Legacy `Objects/Portfolio/ProfilePortfolio.tsx` (938) and `ProfileAchievements.tsx` (811)
  still back journal posts and achievements routes.

Theme and quality gates
- `defaultTheme` is `light` on `dev`; `ForceLightTheme` pins admin, editor, board and auth.
- Hardcoded color literals in learner code: `components/Resources` 60,
  `components/Badges` 44, `components/Plans` 16, `Pages/Portfolio` 9.
- `scripts/source-size.py` ratchets a 500-line limit (baseline entries above must shrink,
  not grow); `scripts/architecture-check.py` forbids `fetch` in components and UI imports
  in services; `quality-gate.yaml`, `web-lint.yaml`, `browser-ui.yaml` run in CI.
- UI tests touching these flows: `tests/ui/hub-plans.spec.ts`, `candidate-*.spec.ts`
  (`/hub`), `portfolio-access.spec.ts`, `mobile-smoke.spec.ts`; routing unit tests in
  `services/routing/__tests__/routing.test.ts`.

## Target architecture

```
AppShell (outside surface: --shell)
├─ Nav: phone bottom bar / desktop side nav, on the outside surface, never moves
├─ PageSurface: rounded card holding the routed page; slides or narrows
└─ CoachSurface: on the outside surface, right of the page
     states: closed │ open │ edge
```

- **CoachProvider** replaces `HubWorkspaceContext` (same surface-hint, edit-run and
  continuation APIs, renamed), plus `{ state, open(options?), tuck(), end(), attach(resource) }`.
  State and the active conversation persist in `sessionStorage` per org + user, so the
  edge follows the learner across routes until they end the conversation (D4).
- **Phone (<768px):** open = page card translates left to a 64px strip, coach full height
  between nav and top. Tuck = page returns to 22px short of the right edge; coach
  translates right and fades out under it (A1). Gestures: swipe left from the right
  20px edge or on the edge strip opens; swipe right on the page strip tucks; taps do
  the same. Horizontal carousels own swipes that start inside them.
  Page card is `inert` and `aria-hidden` while open; Escape tucks.
- **Tablet/desktop (≥768px):** open = page narrows, coach panel right (keep the
  existing resizer, 320–720px, D6); edge = 40px rail with Hub mark and notification dot.
  Desktop side nav Hub item toggles; ⌘/Ctrl+J shortcut.
- **Nav:** Plans · Discover · Portfolio · Hub (coach toggle, shows dot when the coach
  has something). Account, messages and help move to the Portfolio header on phones and
  stay at the bottom of the desktop side nav (D2). News is removed from the learner
  side; Messages replaces it (D3).
- **Routes:** `/` → `/plans`. `/hub` → `/plans?coach=open` (keeps `conversation=`).
  `/hub?resource=x`, `/resource/x` → `/discover/resources/x`. `/resources`, `/search`,
  `/badges` → `/discover` (with `q`/filters) (D1). `/badges/[uuid]` and
  `/badges/collections/*` stay.

## Phases

One PR to `dev`, one or more commits per phase, in order. Each phase removes the code it replaces.

### Phase 0: Foundations (tokens, theme, component kit)

`claude/ui-dark-mode-polish-l6ybmx` was reset to `dev`; `b483fcf` is discarded (owner).

- Theme: `defaultTheme="dark"`. Dark tokens from the kit: page `#131F24`, surface
  `#1B2B32`, raised `#22343C`, line `#2F434C`, text primary/secondary/locked, plus new
  `--shell` (outside surface) and `--edge` (pressable underside). Matching light-mode
  values (light mode stays supported).
- Plan palette as tokens with face and edge pairs (teal, violet, amber, blue, pink,
  lime, orange, sky), deeper header faces so white text passes 4.5:1; badge tile tokens
  per theme. `planTone()` reads tokens instead of computing ad hoc.
- Component kit in `components/ui` (or `components/Learner/kit`), each added to
  `design-system/catalog.json` with a specimen: `Button` variants consolidated to
  primary / plan / surface / ghost / destructive (fold `brand`, `cta`, `ctaSecondary`
  into these; migrate callers), `PathNode`, `SegmentedProgress`, `ShelfHeader`,
  `Shelf`, `MediaCard`, `BadgeTile`, `PlanCard`, `BottomSheet`, `IconButton`.
- Replace hardcoded color literals in learner components (counts above) with tokens.
- Decide `ForceLightTheme` scope: admin, editor and board stay light; auth follows
  the default (D7).

Acceptance: learner routes render dark by default with no light-only islands; light
mode still passes contrast; catalog entries and specimens exist; lint, unit, size and
architecture checks pass.

### Phase 1: App shell and coach

The largest phase and the riskiest; land it behind no flag but with the old Hub routes
redirecting.

New: `components/Shell/AppShell.tsx`, `components/Coach/` (`CoachProvider`,
`CoachSurface`, `CoachEdge`, `useCoachGestures`, `CoachHome`). Split `HubExperience`
into focused modules under `components/Coach/conversation/` (thread, composer,
header/history, edit-run timeline, suggested actions, memory notice, attachments).
Target: no file over 500 lines; `HubExperience`'s baseline entry is removed.

- Coach home (pre-conversation): `HubHomeStack` next actions and launch cards, then
  recents (A2). "Check in with your coach" stays.
- Every "Ask Hub" entry point calls `coach.open({ selection })` and keeps the existing
  surface-hint contract (`setSurface`, selected objective, visible IDs).
- Resource attachment from Discover: `coach.attach(resource)` opens the coach with the
  resource as context (replaces Hub's attach menu "Browse").
- Landing (A6): root redirect, `requestPolicy` hub redirect, demo default `start_path`,
  Studio `START_PAGES`, quickstart config, onboarding banner. Existing demo users with a
  stored `/hub` start path are redirected by the `/hub` route.
- Backend `hub_actions.NAVIGATION_DESTINATIONS`: remove `hub` and stale `programs`;
  agent navigation that targeted Hub resolves to the current page.
- Nav: rewrite `OrgMenuLinks`/`OrgMenu` for the new item set; drop `compact`; move
  phone account entry (D2). Split `OrgMenu` under 500 lines.

Remove: full Hub mode, `HubViewSwitch`/`HubChrome` view switching, `HubResourcesView`
(moves to Discover in Phase 3; until then resources stay reachable through the coach's
resource search), the Continue with Hub pill, `workspace.css` frame rules (rewritten as
shell styles), `#org-layout-right-sidebar` portal and its CSS (Plans moves its panel in
Phase 2), `hubFromLegacy*` helpers (replaced), the `/hub` page body.

Acceptance:
- Phone 390: open/tuck/end by tap, nav item and both swipe directions; carousels
  inside the page still scroll horizontally; iOS back-swipe from the left edge is
  unaffected; chat moves and fades per A1; equal gutters.
- Desktop 1440/1800 and tablet 900: panel push, resize, edge rail, ⌘J, focus order,
  Escape.
- Edge persists across navigation and reload within the session; End removes it;
  switching org or user clears it.
- Edit runs, continuations, page awareness, memory notice and conversation history
  behave as today (existing hub-plans spec updated, new coach-states spec).

### Phase 2: Plans (landing, detail, edit)

- `/plans` home becomes the landing page: plan cards carousel (color, segmented
  progress) above the weekly focus list from `/planning/home`, rendered with
  `PathNode`/step rows. Invitations and completed plans move from
  `PlansOverviewPanel` into this page; the right rail goes away.
- Plan detail: plan carousel header (phone swipe with peeks; desktop folded color
  spines), segmented progress, share and ⋯ actions on the card (phone bottom sheet,
  desktop dropdown), path with only the current step as a card, done and locked as
  one-line rows, locked reason on tap, auto-scroll to the current step, "Ask Hub" on
  the current step.
- One edit mode in place (prototype Plan · edit mode): goal and description editable on
  the card, step-order and target-date chips, plan color swatches (wires up the unused
  `setPlanColor`), steps as a reorderable list that expands to edit name, type,
  description and due date, add step, group into chapters, "Ask Hub to suggest steps".
  Hub agent proposals render inside this same list (restyled `ProposedObjectiveEditor`
  / `ProposedPhaseEditor`, same review contract).
- Split `PlansWorkspace.tsx`: route state, detail, editor, objective card, agent
  proposals, helper feed into separate files; delete the legacy `PlanEditor` virtual
  sections ("Right now", "Completed") and dead `PlanEditorShared` exports. Remove its
  size baseline entry.
- Helper view (plans you help with) uses the same detail layout with helper actions.

Acceptance: create (quick create opens edit mode), edit, reorder, color change, share,
complete, delete, invitations, activity steps, agent proposals accept/reject; phone and
desktop; `hub-plans.spec.ts` updated.

### Phase 3: Discover (badges, plans, resources, search)

- Route `/discover` (D1); search bar full width at the top with filter button (A3);
  applied-filter chips only when filters are set.
- Feed order: hero → Keep going → badge collections → resources as carousels by type
  (A4), then Saved. Badges are the ready-made plans; no other templates for now (D5).
- Hero autoplay (A5): ~6s per slide, segmented timer bar under the hero, pauses on
  hover/focus/touch and when offscreen, no autoplay with reduced motion, swipe on phone.
  Optional `autoplay_seconds` in `DiscoverSettings`.
- Search view (`/discover?q=`): grouped results (badges, collections, resources,
  channels) with per-group "See all", type filter, empty and loading states. Backed by
  `/search` (wire up the unused `searchOrgContent`) plus resource semantic search.
- Resource detail page `/discover/resources/[uuid]` built from `ActiveResourceWorkspace`
  (notes, comments, reviews, save, share) with "Ask Hub about this" → `coach.attach`.
  Saved resources and user channels (from `HubResourceLibrary`) become the Saved shelf
  and its See-all page.
- Remove: Hub resource view files once moved, unused `components/Resources/ResourceCard.tsx`,
  Discover's hardcoded colors.

Acceptance: search-first flow at 390/900/1440; filters; each card type starts or opens
correctly (badge → plan, resource → detail); hero timer and pause;
legacy URLs redirect with query preserved.

### Phase 4: Portfolio

- Remove the tab bar. Overview: banner header (name, tagline, location, avatar, edit,
  preview, share/publish), **bio** (`short_bio`, inline edit) in place of the stat
  overview (A7), featured badges row with locked placeholders, then the owner's enabled
  sections. Section headings open the existing detail routes with a back header.
- Phone account entry: settings button in the header with unread-messages dot (D2).
- Split `PortfolioShell.tsx` below 500 lines; remove its baseline entry. Public
  `/user/[username]` uses the same layout without owner controls.
- Audit legacy journal/achievements (`ProfilePortfolio`, `ProfileAchievements`): keep
  routes working; record a removal follow-up if they are no longer linked.

Acceptance: owner and visitor views, publish/unpublish, bio edit, section ordering,
`portfolio-access.spec.ts`.

### Phase 5: Sweep

- Delete leftovers found during the phases; ratchet `source-size` and
  `architecture` baselines; update `docs/product` map, design index and catalog.
- Rendered verification record (repo practice): phone 390, tablet 900, desktop 1440 and
  1800; dark and light; coach closed/open/edge; screenshots compared with the canvas.
- Move this plan to `docs/plans/completed/` with evidence.

## Decisions (owner, 2026-10-13: defaults accepted except D3 and D5)

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Rename `/badges` to `/discover`? | Yes; redirect `/badges`, keep `/badges/[uuid]` |
| D2 | Where do Account, Messages and Help live on phones? | Portfolio header settings button with unread dot |
| D3 | News nav item | **Owner: remove**; Messages replaces it. Learner news routes, nav and Discover news slides go; admin/backend news is a follow-up |
| D4 | Does the edge persist across pages? | Yes, for the session, until the conversation is ended |
| D5 | Ready-made plans | **Owner: not now**; badges are the ready-made plans |
| D6 | Keep desktop coach resizing? | Keep (already built, 320–720px) |
| D7 | Auth pages: light-pinned or follow the default? | Follow the default (dark) |
| D8 | Light mode | Supported with the same component kit, not just tolerated |

## Risks

- **Gestures**: swipe conflicts with carousels, text selection and iOS back-swipe.
  Mitigation: edge-start zone, carousel ownership, tap alternatives, real-device check.
- **Splitting `HubExperience`** can regress edit runs and continuations. Mitigation:
  move code without behavior change first, then restyle; keep the existing spec green.
- **External links to `/hub`** (emails, demo start paths, agent actions). Mitigation:
  permanent redirects with query preserved; routing unit tests.
- **Scope**: Phases 1 and 2 are each large. Keep PRs to one phase; land Phase 0 first
  so later diffs are behavior, not color churn.

## Progress

- [x] Owner review of this plan and decisions D1–D8
- [ ] Phase 0 · Foundations
- [ ] Phase 1 · App shell and coach
- [ ] Phase 2 · Plans
- [ ] Phase 3 · Discover
- [ ] Phase 4 · Portfolio
- [ ] Phase 5 · Sweep and verification
