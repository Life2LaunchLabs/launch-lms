# Proposed delivery backlog

Planning-only draft, 9 September 2026. No new Jira keys are assigned here. BOT-82 remains Idea with its original wording and existing Notes comment preserved. The owner requested a full plan, not implementation. Use the local Jira workflow to formalize approved slices; do not mark this feature In Review merely because this document is complete.

Proposed epic: **Co-create in the learner workspace with the Hub companion**. Related initiative: BOT-64. Move BOT-82 under it only when adopting this proposed hierarchy. The current helper supports Story creation, not epic creation/reparenting; use a supported Jira administration path at that future boundary rather than inventing helper flags.

## C1 — Keep the same Hub conversation alongside the learner app

Priority: High. Product links: changes `PATHWAYS-G006-A002`, related `PATHWAYS-G006-A001`. Depends on owner shell concepts.

**Outcome** — A learner moves between Hub and their app while keeping one conversation and composer.

**Context** — Conversation state currently belongs to the Hub page. The learner shell already contains app navigation, sidebar content and mobile overlays.

**Build notes** — One shared conversation controller; full/companion/tucked layouts; user/org reset; same thread URLs and history. Preserve one composer and deterministic resource search.

**Owner test scenarios** — Start a chat, type an unsent prompt, visit Plans and a resource, hide/reopen and expand to Hub. Verify the same thread and draft. Repeat on phone with keyboard open; switch organizations and confirm isolation.

Deliverable Subtasks: shared conversation controller and restoration; responsive outer shell and native design-system preview.

## C2 — Ask about the page or objective currently in view

Priority: High. Links: changes `PATHWAYS-G006-A001`, related `PATHWAYS-G001-A002` and `PATHWAYS-G006-A006`. Depends on C1 and BOT-123/124; shares the BOT-122 assembler.

**Outcome** — The learner can ask about an open plan, selected objective or supported resource without copying its saved contents into chat.

**Context** — Existing Hub grounding does not identify the learner's current page or selection. Browser attention and authoritative facts have different trust boundaries.

**Build notes** — Typed surface adapters, permission-filtered server facts, visible context control and source receipt; explicit unsaved-text sharing. No model navigation or plan mutation.

**Owner test scenarios** — Select an objective and ask “What does this mean?”; edit it normally and ask again. Compare shared/unshared draft text, context off and unsupported pages. Navigate during an answer and verify it retains the original source label. Try an inaccessible plan and ensure neither text nor receipt leaks.

Deliverable Subtasks: native Plans/resource surface adapters; server attention resolution and bounded source receipt; context disclosure and selection controls.

## C3 — Let Hub open and reveal requested learner content

Priority: Medium. Links: changes `PATHWAYS-G006-A001`, related `PATHWAYS-G001-A002`. Depends on C2 and provider/run spike.

**Outcome** — On request, the companion takes the learner to an accessible plan/resource and points to the intended objective.

**Context** — Read-only context is proven; navigation now needs typed effects and stale-run protection.

**Build notes** — Allowlisted entity routes, request-bound effects, actual execution acknowledgments, cancellation/idempotency and unsaved-editor guard. No arbitrary URL/code execution.

**Owner test scenarios** — Ask to open a plan and reveal an objective; try Back, Stop, another page before response, unavailable targets and an unsaved editor. Confirm no late jump and no lost edits.

Deliverable Subtasks: provider-neutral bounded run/event lifecycle; safe navigation and reveal handlers with native target treatment.

## BOT-82 — Co-create and confirm an independent personal plan

Priority recommendation: High once C1/C2 are reviewed. Links: retain adds `PATHWAYS-G006-A004`; changes `PATHWAYS-G001-A003`. Depends on C3 and approved draft/review concepts.

**Outcome** — A learner and Hub build an independent personal plan in the native Plans workspace, then the learner creates it explicitly.

**Context** — The current editor saves directly and plan creation requires a completion date. There is no recoverable co-creation working copy.

**Build notes** — Private versioned working copy, shared manual/agent editing, typed operation batches, visible draft save status, undo and atomic idempotent Create. Retain current plan validation and permission rules. Preserve the existing restriction on silent Notes writes.

**Owner test scenarios** — Start an incomplete plan, request phases/objectives, rewrite one yourself while the agent responds, reject a suggestion, reload and resume, then create. Confirm no live plan exists before Create and only one exists after retry. Missing dates block Create with an understandable correction.

Deliverable Subtasks: private working-copy persistence and native editor adapter; validated personal-plan proposal tools; atomic confirmed creation and draft change history/recovery.

## C4 — Review and apply proposed changes to an existing personal plan

Priority: Medium. Links: changes `PATHWAYS-G006-A004` and `PATHWAYS-G003-A006`. Depends on BOT-82 and all-writer revision audit.

**Outcome** — A learner previews an agent's proposed plan changes, edits them and applies exactly the reviewed version.

**Context** — Existing plans can change in another tab or through collaborators. Restoring old copies would overwrite later work.

**Build notes** — Base revisions across every relevant definition writer, field-aware comparison, atomic application, permission rechecks, attribution and guarded reversal. Group assignment definitions remain outside this capability.

**Owner test scenarios** — Revise a title/date/objective, inspect before/after and apply. Change the same field in a second tab and verify a conflict. Revoke permission before approval. Retry a lost response. Review a reversal after a later manual edit and verify it preserves that edit.

Deliverable Subtasks: shared definition concurrency enforcement; native proposal comparison/conflict resolution; confirmed apply and guarded reversal history.

## Follow-on candidates, not implementation-ready Stories

* Grounded badge/resource additions to personal-plan drafts, with canonical IDs and native field support.
* Explicitly requested resource Note proposals through the same confirmed action boundary, preserving BOT-82's owner comment.
* Portfolio drafting and publication, with separate audience/publication review.
* Group-plan, template and educator/admin workflows, with shared-definition authority and affected-learner review.

Each requires its own compact formalization and existing product-map search. Do not create test-command Subtasks or duplicate BOT-122/126. At implementation handoff update references and acceptance criteria, queue review notes and synchronize Jira; only the owner moves work to Done.
