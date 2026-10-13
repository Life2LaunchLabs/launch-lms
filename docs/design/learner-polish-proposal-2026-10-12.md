# Learner UI polish proposal

Date: 2026-10-12. Status: owner approved implementation on 2026-10-12;
this document is the selected direction and acceptance brief. Source revision: `b9bbdcf7`, with pre-existing local
CLI and Git attributes changes left untouched.

## Direction

Make the four primary destinations feel like one product with distinct purposes:

- **Discover:** choose something worth earning.
- **My plans:** see and do the next step.
- **Hub:** get help deciding, continue a conversation, or find a resource.
- **Portfolio:** show the work and achievements those steps produced.

Keep badge artwork and plan identity. Make the surrounding interface quieter:
consistent headers and gutters, smaller cards, fewer decorative containers, and
one clear action per step. This proposal preserves the single plan engine and
does not introduce another badge journey or a second onboarding checklist.

## Evidence and coverage

The supplied Plans screenshot is the current visual reference from the owner
conversation. It shows the header gap, oversized step cards, ambiguous play tile,
and right rail above the content start. It has not been copied into the repository;
the attachment remains its provenance. Other findings below come from source
inspection, not current rendered screenshots or browser interaction.

Reviewed the design-system catalog, shared layout and headers, product map, active
badge/plan build decisions, and these learner-facing route families:

| Surface | Review and proposed focus |
| --- | --- |
| Hub home, conversation, companion, resources | Layout ownership, recents/history, memory notice, resource navigation |
| My plans, plan detail, create/edit, sharing, invitations, activity player | Density, return navigation, controls, capabilities, failures and completion |
| Discover, badge detail, collections | Shared chrome, colors, carousel, recommendations, start/continue states |
| Portfolio overview, timeline, projects, badges, resume, public profile | Presentation versus editing, legacy achievements overlap, publish/share language |
| Account, messages, organizations, memory, appearance/security | Consistent settings layout and save feedback |
| News, podcasts, boards, playgrounds, store | Secondary-surface headers, card/control consistency and entry points |
| Login, signup, welcome | Return destinations, onboarding continuity and visual foundations |
| Legacy resource/search/organization routes and community routes | Preserve intended redirects; community entry routes currently return not-found |

This is a broad source review of user-facing route families, with deeper review of
the four primary destinations. It is not a visual audit of every page, every
feature-gated branch, or every role. Admin screens are outside this proposal.

Initial proposal-time evidence limitation (resolved during implementation; see [rendered verification](learner-polish-verification-2026-10-12.md)): no app responded at localhost:3000
or API health at localhost:8000; synthetic UI target/login variables are absent.
`./scripts/agent doctor` fails because Bun is missing. Existing browser harness:
`apps/web/tests/ui/README.md`. No browser pass is claimed.

## Owner notes carried forward

The owner described these as “at a glance notes” and asked for a proposal, including
larger flow and structure changes. Their concrete requests are retained here:

- Discover: “doesnt have our standard layout header”; non-system background and
  carousel-tab card styling; repeated “challenges coming soon” banner is unnecessary.
- My plans: large header gap; smaller cards and This week title; play icon box
  above Start looks like a competing button.
- Plans rail: align under the header with main content; remove duplicate Plans
  title and Active/Completed switcher; completed count expands at the bottom.
- Plan detail: trim header with a back arrow to Plans; remove right sidebar;
  configure details in the plan header; assigned Launch Ready should allow sharing
  without allowing “when steps open” changes.
- Sharing: small bar under header progress with overlapping avatars and wording
  such as “Shared with Tom P.” or “Shared with three people”; opens share modal.
- Hub: sidebar next to centered content; restore discrete conversation history
  below What to do next; fix recurring memory notice; switch left, Save right.

## 1. Shared layout and visual language

Use the adopted `GeneralWrapper`, existing top-level header pattern, and
`ContentPageHeader` for detail returns. Give Hub the same centered navigation/content
alignment while preserving its stable conversation instance and companion behavior.
Main navigation, content, and optional rail should share a containing layout.

Use `background`, `card`, `muted`, `foreground`, and `border` for product chrome,
plus the existing Button/Card/Select/Dialog primitives. Artwork can retain its
own palette; page backgrounds, tabs, controls, skeletons, and error panels should
follow theme and tenant tokens. Plan colors need contrast-aware text and dark-mode
tints. If reusable plan-color or badge-art tokens are added, register and preview them.

Proposed density targets, to confirm in rendered review:

| Element | Proposed treatment |
| --- | --- |
| Main page title | Existing standard header scale; avoid bespoke oversized titles |
| This week and section titles | Approximately 22–24px, with quieter date and count |
| Step title | Approximately 16–18px; readable wrapping rather than forced truncation |
| Step padding | Approximately 12–16px; reduce decoration before reducing text |
| Non-selected step | Aim for about 72–88px with short content; grow for long text |
| Actions | Existing shared variants; retain accessible touch targets |
| Header-to-content gap | Approximately 24px; no reserved space for absent controls |

On phones, use one column, wrapping metadata, and a labeled plan picker. Keep
touch targets large even as desktop cards shrink. Check intermediate widths and
the Hub companion, where desktop viewport width does not equal available content width.

## 2. Discover: consistent shell, stronger browsing

**Required:** visible Discover header; shared canvas and carousel-selector surfaces;
remove the repeated lower Challenges banner. At most retain one quiet coming-soon
mention until there is an actual challenge to do.

**Recommended:** simplify featured content to one moderate-size hero with compact
selectors below it. The current 440px hero plus dark side selector competes with
the rest of the product. Keep image-led badge cards and useful series shelves.
Use explicit controls rather than automatic rotation by default; this also avoids
content changing while someone is reading or choosing.

Put Keep going before promotion when someone already has a badge plan. Use
“Continue plan” for an existing plan and “View badge” when a card opens an information
page. A button that only opens badge details should not imply it starts the plan.
Actual Start earning remains on the badge page and creates the plan in one action.

The current “Picked for you” row sorts by coming-soon status rather than personalized
relevance. Rename it “Explore badges” unless real recommendation logic supports
the claim. Reduce repeated badges across this row, series rows, and More badges.
Add lightweight search/access filters when catalog size warrants them, not as
empty controls in a small catalog.

Badge detail should show art, title, what it proves, issuer, effort, and the start
action close together. Collapse alternate routes and extra marketing below that.
Replace the wide horizontal step-preview diagram with a compact list on phones.
Collections should lead with earned count and next unearned badge, then the set.
Apply shared headers/tokens to these pages too, not just the Discover feed.

## 3. My plans: compact weekly action list

**Required:** remove the empty filter-row spacer; compact the weekly summary and
step cards; remove the large decorative play tile. A small activity icon beside
the type is enough. Card selection reveals context; the single labeled
Start/Continue/Review action launches the work.

Keep the timeline, plan label, and selected-card distinction but reduce thick
outlines, card shadows, and saturated fills. Done steps should be quieter and
remain legible; their title need not be struck through like a discarded task.

The weekly summary should show date, This week, completion count, and progress
in a compact region. Keep weekly pace available as a small secondary control;
explain that dated/overdue work can make the total exceed the pace target. Keep
Ready for more secondary until the week is complete.

Right rail on the overview only: start at the same vertical position as the weekly
content, remove its duplicate Plans heading and lifecycle tabs, list active plans,
then New plan actions, then `3 completed plans` as an inline disclosure. Hide that
disclosure when the count is zero. Expanding completed plans must not replace or
refetch away the active list. Preserve progress colors across both lists.

Collapse Later and large future sections by default if they make the overview
feel like a backlog. Keep Next week easy to inspect. Preserve selection and scroll
when returning from a step. When all active work is finished, celebrate briefly
and offer Discover or Create your own, rather than showing an empty weekly shell.

## 4. Plan detail: one header, no management rail

Use the trim header: `← My plans`, including a deterministic destination for a
direct link. Below it: compact plan identity/source, goal, progress, read-only
opening rule, and About this plan. Remove the right sidebar from learner detail
and move allowed actions into the header or its menu.

Under progress, add a small clickable sharing row with up to three overlapping
avatars and visible text: “Shared with Tom P.” / “Shared with 3 people”. Empty
state: “Share plan” when allowed. Open the existing share modal; distinguish
approved collaborators from pending invitations and school approval requests.
This shares access to a private plan, not publication of a public portfolio.

Move permitted goal/details/schedule editing into header edit mode with Save and
Cancel. Keep editing separate from doing steps. Secondary complete/reopen/delete
actions belong in the menu and remain capability-controlled. Source-assigned plans
show organization-controlled details as read-only; personal plans retain editing.

**Permission correction is required:** Launch Ready currently uses
`create_own_plan`, which makes the learner both owner and `plan_admin`. The API
grants owners all capabilities; `StepOrderSetting` already checks `edit_structure`.
Thus the visible control reflects backend authority, not merely a missing UI guard.
Define a source-controlled policy for starter/locked assigned plans and enforce it
in effective capabilities and mutation handlers. Keep sharing/request-sharing and
learner progress, but deny structure and organization-controlled schedule changes.
Audit role grants so sharing cannot restore those denied capabilities. Handle
existing plans as well as newly created ones; preserve completed activity evidence.
Do not blanket-lock every plan created from a template: personal/adaptable plans
are a different case.

Prefer an explicit compact plan picker to the side peeks and dots when moving
between plans. The current carousel consumes width and duplicates overview
navigation. This is an optional structural change requiring owner selection;
the requested back arrow and removal of the rail can proceed without it.

Avoid auto-scrolling past the header immediately on entry. Show the next step
selected and offer “Go to next step” for long plans; returning from an activity
can restore the position. At completion, show an earned badge when present and
link to Portfolio. The current generic finish line promises a portfolio milestone;
verify persistence exists before promising a reward that is only decorative.

## 5. Hub: help, history, and explicit memory choice

Align navigation with the centered Hub content. Preserve the stable full/companion
conversation instance, composer behavior, resize support, and mobile overlay focus.

Home hierarchy: What to do next → Recent conversations → composer. Show a discrete
list of about five conversations with title and relative date; expand older history
inline with search and sensible grouping. The existing home implementation shows
three recents plus an absolute-positioned See more overlay. Reuse its data and
selection handlers, but avoid making history look like another floating panel.
Do not auto-focus history search when it becomes a permanent section.

Offer “New conversation” explicitly and retain header history for use during a
conversation. Next-step links should retain plan context and use the same action
language as Plans. Keep resource browse/save/use-in-chat actions distinct; returning
from a resource should preserve the query, filters, conversation, and draft.

Memory notice: left side Switch + “Memory on/off”; right side Save; explanatory
text and Learn more remain quiet. Toggle changes a draft only. Save persists the
choice and dismissal together, including when the choice is unchanged. Keep the
notice visible on failure with a useful retry message, and disable duplicate saves.
Dismiss closes without applying an unsaved choice; its acknowledgement persists
without changing the stored enabled value. Do not silently treat failed writes as
successful acknowledgement.

The existing dismissal is persisted, but errors are swallowed, and preferences
are keyed by organization + user. Reproduce same-account relogin, organization
switch, request failure, and concurrent full/companion mounts before assigning a
root cause to repeated display. Preserve current organization scoping unless the
owner selects an account-wide policy. Account → Memory remains the durable place
to revisit the setting. Turning memory off and deleting existing memories remain
separate, clearly explained actions.

## 6. Portfolio and other learner surfaces

**Portfolio:** consolidate earned-badge presentation and controls. Both the newer
PortfolioShell Badges view and legacy ProfileAchievements routes still exist.
Trace their public and owner entry points before redirecting or retiring anything;
preserve award verification, portable downloads, recorded certifications, and old
shared links. Give each achievement one clear home and avoid two feature controls.

Present overview → timeline/projects/badges/resume with consistent tabs. Keep
editing controls in owner mode, and make Preview, Publish, and Share distinct:
“Save changes” saves a draft; publishing controls public visibility; sharing shows
the audience/link. The standalone project editor currently calls creation “Publish
project”, so reconcile its wording with actual visibility. Link the Launch Ready
guide to its existing plan steps rather than introducing another checklist. Public
pages should show proof and work, without learner management chrome.

**Account:** reuse its existing tabbed header; keep section titles subordinate to
Account and move detailed controls into predictable groups. Make saved/saving/error
states consistent. Align Memory settings behavior and explanation with the notice.
Keep messages/invitations actionable without making the learner interpret role jargon.

**Secondary content:** standardize News, podcast/library, board, playground, and
store headers, search, empty states, and card actions. Retain feature gating and
existing access rules. Surface secondary tools contextually through Hub, organization
content, or account navigation rather than expanding the four primary items.
Do not revive retired communities or old search/resource pages just for polish.

**Authentication/onboarding:** preserve the intended badge/plan/invitation destination
through login, signup, and welcome. Verify existing links that use different return
parameter conventions. Apply shared form/color foundations while preserving branded
auth presentation. End onboarding in the starter plan or its next step with context,
not an unexplained generic landing page.

**Failure states:** PlansHome currently treats absent data as loading, and the
workspace does not expose SWR errors for its key reads. Replace indefinite spinners
with specific load failures and Retry; distinguish unavailable, unauthorized, empty,
and completed states. Skeletons should match the compact layout. This is more
valuable than additional decorative animation.

## Suggested delivery order

| Batch | Outcome | Dependencies |
| --- | --- | --- |
| 1 | Correct assigned/starter permissions; stable error states; explicit memory save/persistence | Role/policy negative tests and existing-plan handling |
| 2 | Shared alignment/headers; compact weekly list; overview rail/disclosure; plan back navigation and sharing header | Browser references for overview/detail/Hub on desktop and phone |
| 3 | Discover, badge and collection visual consistency; clearer browse/start actions | Owner selection of featured layout; keep existing start semantics |
| 4 | Portfolio consolidation, secondary pages, onboarding return continuity | Legacy-link/access audit; targeted references and role scenarios |

Batch 2 can be designed while Batch 1 is implemented. Keep API permission fixes
reviewable separately from visual changes. Formalize selected work as BOT Stories
with implementation deliverables; these proposal sections are not dispatched tasks.

## Acceptance and browser review plan

Use synthetic fixtures at 1440×900 desktop, 390×844 phone, an intermediate tablet
width, and the owner's approximately 1800px-wide layout. Include desktop with
Hub companion open, expanded/collapsed navigation, light/dark, and a contrasting
tenant accent. Preserve the supplied screenshot as current-state context and
register owner-selected annotated references before dependent implementation.

- Plans: zero/one/many active plans; zero/many completed; invitation/helping states;
  completed disclosure keeps active plans; long step title; Start/Continue/Review;
  waiting review, changes requested, prerequisite and dated locks; future sections.
- Detail: direct link/back; completed plan; source assigned versus personal;
  locked starter API mutations denied; sharing and role changes cannot bypass locks;
  helpers, pending invites, source descriptions, progress, and correct reward state.
- Discover: guest/member; empty/small/large catalog; earned/in-progress/open/request/
  invite/coming-soon states; long artwork titles; start once then resume same plan.
- Hub: recent list/search/older history; switching conversations and resources;
  composer/keyboard; companion resize/overlay focus; memory draft/save/dismiss/failure;
  relogin, reload, organization switch, and full/companion persistence.
- Portfolio/account/auth: private/public/preview; award verify/export; old shared
  URLs; save versus publish; invitation and badge start through signup/login.
- Across changed surfaces: keyboard order and visible focus; readable contrast;
  touch targets; reduced motion; no horizontal overflow; loading/error/retry.

Capture and inspect actual browser screenshots against selected references; exercise
the interactions above and record revision, viewport, capture/trace paths, findings,
and accepted deviations in a task-specific report. No UI implementation or visual
verification is part of this proposal-only change.

Proposal checks: `git diff --check` passed. Both `./scripts/agent check --changed`
and `--all` passed documentation validation and product-map validation/render
checking, then were interrupted during the slow source-size scan with no result
from that gate. Neither overall check completed; architecture/frontend/API checks
are unverified. Missing Bun also blocks the frontend portion of `--all`.
