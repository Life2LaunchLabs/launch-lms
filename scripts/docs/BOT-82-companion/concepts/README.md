# Mockup commission: Hub companion

This folder is ready for owner-supplied concept art. Start with the first six compositions below; the remaining boards make interaction details reviewable without polishing dozens of independent screens. Build scope and technical rationale are in [the plan](../build-plan.md).

## Direction to carry into every mockup

Launch LMS is a learner workspace. The agent feels like a collaborator sitting outside the product, while the learner continues using the real Plans interface. Use the supplied Base44 image for spatial hierarchy: quiet conversation on the left, framed live app on the right. Gemini contributes separation of conversation and editable work; ElevenLabs contributes a restrained companion. These are visual references, not literal app content or requirements for a code editor, Publish toolbar or chatbot bubbles.

Inside the app frame show Launch navigation, page title, existing Plans list and real phases/objectives. Keep one authoritative plan. Outside it show conversation title/history access, expand/hide controls, page-context indicator, transcript and one composer. Agent answers read as document prose. Ordinary search/resource references may remain in chat, but no miniature duplicate plan editor. Reuse the Launch tokens/components from `apps/web/design-system/catalog.json`: card/background/muted/border, tenant accent, Button, Input, Textarea, Badge, Dialog, Popover and Tooltip. Existing Plans typography can be refined intentionally, but label any broad restyling as a separate proposal.

Use this common sample content throughout:

* Learner: Maya. Conversation: **Finding my next step**.
* Plan: **Explore a career in design**. Target: **15 December 2026**.
* Phase: **Explore possibilities**. Objectives: **Compare two design roles**, **Talk to a working designer**, **Try a small project**.
* Selected objective: **Compare two design roles**, due **30 September 2026**.
* User: **What is this step asking me to do?**
* Answer: **Compare the day-to-day work in two design roles. You could note what interests you, what skills each needs, and one question you still have.**
* Context: **Viewing: Explore a career in design**; selected chip **About: Compare two design roles**.

All dimensions below are CSS viewport sizes and provisional design targets, not screenshots' export pixel dimensions. Export at 1× or 2× and label the scale.

## First concept set: six compositions

| ID / suggested filename | Viewport and composition | Required visible content | Decision it resolves |
|---|---|---|---|
| D01 `d01-desktop-companion-left-v01.png` | 1440×960. Left companion around 360px; a narrow gap and framed app fills the rest. | Populated sample conversation; context/selection chips; composer; real Plans list and selected objective. App navigation stays inside the frame. Show what happens to Plans' own side panel: fold list/detail affordances before creating four permanent columns. | Does the companion feel outside the app while Plans still has usable width? |
| D02 `d02-hub-expanded-v01.png` | 1440×960, expanded Hub using the same title and transcript as D01. | Existing resource/discovery affordances, history, single composer and a return-to-workspace action labeled with the plan. No duplicate companion alongside full Hub. | Is conversation continuity obvious? |
| D03 `d03-app-tucked-v01.png` | 1440×960, app given back its width. | Small labeled **Continue with Hub** edge control; no giant floating bubble. Show it alongside app navigation, notification and podcast controls. | Can learners dismiss the companion without feeling they ended the conversation? |
| D04 `d04-compact-desktop-v01.png` | 1024×768 plus an inset at 1280×800. | The same dense plan, narrower app navigation and a way to open the plan list. At 1024 prefer chat overlay if minimum usable app width cannot coexist with roughly 320px chat. | Where should split layout give way to overlay? Do not just scale all text smaller. |
| M01 `m01-mobile-page-and-launcher-v01.png` | 390×844 phone. | Native objective view; compact companion entry; existing bottom nav, safe area and optional player. Show a selected-object **Ask Hub about this** entry point. | Where does the companion live without covering the current task? |
| M02 `m02-mobile-conversation-v01.png` | Two frames at 390×844: keyboard closed and open. | Full-height conversation over the app, clear **Back to plan**, same thread/selection, sticky composer above keyboard; optional peek sheet only as an alternate concept. | Can the learner ask, inspect an answer, then return to the same objective/scroll position? |

Generate D01 in two visual treatments if useful (subtle border vs soft elevation). A right-dock alternate can be supplied for comparison, but the left arrangement is the proposed default. Do not spend effort on a movable dock system yet.

Owner amendment, 10 September 2026: the implemented companion direction is right-docked. For Phase 3, the companion header carries the active editing scope in the same place as the unsupported-page notice. Entry uses a split **Work on this plan** button: the main segment confirms, while the arrow segment exposes **Open plan without editing**. The composer Send control becomes Stop for any active response or run. A compact outstanding-edits tray slides down immediately above the composer.

Agent edits use the native object editor. Only the field currently being prepared becomes a quiet skeleton/shimmer; a focused or dirty learner field is never taken over. A complete validated value then appears with a fast, length-aware type-on effect. Touched fields use a calm accent, **Customized** plus Undo appears after learner modification, and each object retains its ordinary **Save** and **Cancel** actions. Several objects may remain in edit mode. Activity collapses from transient inspection lines into durable summaries, and object links produce one restrained outline pulse. Reduced-motion variants replace shimmer/type-on/pulse with static status and focus treatment.

## State boards for the read-only release

These can be crops/contact sheets derived from the six compositions. For each state show both desktop placement and its phone adaptation where different.

| Board | Frames to include | Required copy/behavior |
|---|---|---|
| S01 — Context and pointing | Current page; selected objective; selection removed; unsupported page; source receipt opened | Supported context stays quiet. Unsupported pages show **I can't read this page yet** in the companion header with a help tooltip. Receipt distinguishes selected object, saved plan facts and explicitly shared draft text. Do not imply screen capture or continuous monitoring. |
| S02 — Unsaved and changing context | Unsaved title; include-text action; shared text chip; learner changes page while answer is pending | **Using saved plan details** / **Include my unsaved text**. Completed answer remains labeled for the original plan, current header tracks the new page. No automatic rewrite of the answer. |
| S03 — Conversation lifecycle | Empty first use; history open; long conversation scrolled up; sending; answer ready; failed/retry; unavailable/rate-limited; archived thread | Preserve typed content on error. Show pending status without fake tool activity. In later streaming mode add Stop and partial-response variants. History is a light popover/sheet, not another permanent column. |
| S04 — Responsive and accessible | 768×1024 portrait; 320px narrow; dark; strong/light tenant accent; keyboard focus; resizing; 200% zoom | No color-only selection or status. Visible focus on launcher, separator and composer. Describe pane tab order and focus return. Show modal layering without competing focus traps. |

An introduction can say: **Hub can use details from supported pages when you send a message. Unsaved text is only included when you choose to share it.** Provide **Got it**. This is a product explanation, not a permission popup on every turn.

## Future interaction boards: design now, polish after release one

| Board | Required frames | Details that must be visible |
|---|---|---|
| F01 — Requested navigation | “Open my design plan” → opening → objective revealed; unsaved-change guard; target unavailable; stopped | Small narration and a restrained target highlight. A direct navigation request does not need a second routine confirmation. An unsaved form offers Save/Stay/Discard as appropriate. No fake cursor or automatic scrolling after the user leaves. |
| F02 — New working draft | Blank/incomplete → agent batch added → learner manually changes an objective → reject/undo suggestion | Real Plans canvas labeled **Working draft**. Title/date/phase/objective controls remain native. **Draft saved · not applied to plan** and disabled Create explanation for missing date. AI suggestion attribution is secondary, not neon decoration. |
| F03 — Review and create | Summary of proposed content; corrected missing date; applying; created; retry after uncertain network result | Primary **Create plan**, secondary **Keep editing**, clear discard path. Private draft storage is distinct from a live plan. Chat reports creation only when confirmed by the server. |
| F04 — Edit existing plan | Before/after text; added objective; removed objective; reorder; accept/reject batch; apply | The saved plan remains identifiable. **3 proposed changes** opens review in the app surface. Label **Apply changes** and who can see the saved plan. Do not use “Publish” for ordinary personal-plan saving. |
| F05 — Conflict and recovery | User changed same field; collaborator changed plan; permission lost; resumed draft; history/reversal | Plain conflict choices showing both values; refresh/review path. Keep manual text safe. **Review reversal** is distinct from unconditional rollback. Show a phone review flow with app/chat switching rather than tiny parallel panes. |

## Motion storyboard

Supply 4–6 annotated frames (or a short prototype) for Hub → companion → objective selection → hide → restore → full Hub. Label trigger, what moves, what remains, resulting focus and preserved scroll. Proposed motion is subtle and brief; include a reduced-motion instant transition. On mobile, include app → conversation with keyboard → Back to plan. These transitions communicate the product idea more effectively than isolated polished screens.

## Reusable generation prompt

> Create a high-fidelity Launch LMS interface concept for [ID] at [viewport]. A persistent AI companion sits outside the learner application, using the spatial hierarchy of the supplied Base44 reference: quiet conversation on the left and a lightly framed live application on the right. Use the supplied Launch Plans reference and the sample content in this brief. Keep the native plan editable inside the app. Include [required state and exact copy]. Show restrained neutral surfaces, readable text, a single tenant accent, subtle borders, clear focus and practical controls. Preserve app navigation inside the app frame. Annotate the intended interaction separately from the UI. This concept illustrates [read-only awareness / future draft review], so display only capabilities belonging to that phase.

For mobile substitute: “One usable full-width surface at a time, a compact companion entry on the plan and an expanded conversation with a clear return-to-plan control. Respect the keyboard and bottom safe area.”

## Folder and review handoff

Put images in this folder, using the IDs above. Optional subfolders: `references/`, `desktop/`, `mobile/`, `states/`, `future/`, `chosen/`. Place a short `.md` sidecar beside a concept with: concept ID, viewport, scale, version, what you like, what to change and any intended behavior. Preserve alternates; list chosen filenames in `selection.md` when ready. Include current Launch screenshots as references if generating outside this workspace; the supplied inspiration images are not a substitute for native Plans content.

Minimum handoff before shell implementation: D01–D04, M01–M02, S01/S03 and the transition storyboard, with selected direction. S02/S04 complete the awareness release review. F01 is needed before navigation; F02/F03 before BOT-82 drafting; F04/F05 before existing-plan editing. Rough annotated state crops are sufficient; every error state does not need finished concept art.

Review for hierarchy, readable app width, continuity of the same thread, clear current-page/selected-object meaning, reachable mobile composer, recoverable return to the plan, and a clear draft-versus-saved distinction. Mockups guide appearance and interaction; keyboard behavior, concurrency and permissions still need implementation verification.
