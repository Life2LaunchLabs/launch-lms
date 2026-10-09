# Proposed delivery backlog

Living delivery backlog, updated 10 September 2026. The co-creating-agent roadmap is now formalized in Jira through learner plan creation and revision, grounded plan references, portfolio and Note creation, governance, and the final staff/group expansion. Use Jira as the delivery record and this file as the dependency map.

Parent initiative: BOT-64, **The Hub: unify learner discovery, guidance, and action**. The Stories below remain independently reviewable outcomes beneath that initiative.

## BOT-156 — Keep the same Hub conversation alongside the learner app

Priority: High. Product links: changes `PATHWAYS-G006-A002`, related `PATHWAYS-G006-A001`. Depends on owner shell concepts.

**Outcome** — A learner moves between Hub and their app while keeping one conversation and composer.

**Context** — Conversation state currently belongs to the Hub page. The learner shell already contains app navigation, sidebar content and mobile overlays.

**Build notes** — One shared conversation controller; full/companion/tucked layouts; user/org reset; same thread URLs and history. Preserve one composer and deterministic resource search.

**Owner test scenarios** — Start a chat, type an unsent prompt, visit Plans and a resource, hide/reopen and expand to Hub. Verify the same thread and draft. Repeat on phone with keyboard open; switch organizations and confirm isolation.

Deliverable Subtasks: shared conversation controller and restoration; responsive outer shell and native design-system preview.

## BOT-156 / BOT-159 — Ask about the page or objective currently in view

Priority: High. Links: changes `PATHWAYS-G006-A001`, related `PATHWAYS-G001-A002` and `PATHWAYS-G006-A006`. Depends on C1 and BOT-123/124; shares the BOT-122 assembler.

**Outcome** — The learner can ask about an open plan, selected objective or supported resource without copying its saved contents into chat.

**Context** — Existing Hub grounding does not identify the learner's current page or selection. Browser attention and authoritative facts have different trust boundaries.

**Build notes** — Typed surface adapters, permission-filtered server facts, visible context control and source receipt; explicit unsaved-text sharing. No model navigation or plan mutation.

**Owner test scenarios** — Select an objective and ask “What does this mean?”; edit it normally and ask again. Compare shared/unshared draft text, context off and unsupported pages. Navigate during an answer and verify it retains the original source label. Try an inaccessible plan and ensure neither text nor receipt leaks.

Deliverable Subtasks: native Plans/resource surface adapters; server attention resolution and bounded source receipt; context disclosure and selection controls.

## BOT-163 — Let Hub suggest learner-controlled navigation across Launch LMS

Priority: High. Links: changes `PATHWAYS-G006-A001`, adds `PATHWAYS-G006-A004`. Builds on BOT-156/159.

**Outcome** — Hub recognizes when advice should continue elsewhere in Launch LMS and offers a clear post-response action; the learner decides whether and when to navigate.

**Context** — Read-only context is proven. BOT-163's original clickable badge/plan references are the first presentation of a broader co-creation capability foundation.

**Build notes** — Provider-neutral semantic proposals persisted with assistant messages; code-owned capability registry; click-time ownership, feature, permission and route resolution. Render compact action controls after prose rather than model-authored inline links. Platform instructions tune suggestion priorities across providers while schemas and safety remain application-owned. No automatic navigation or arbitrary URL/code execution.

**Owner test scenarios** — Ask how to create a plan, add experience to the portfolio Timeline, work on badges and reach other enabled learner surfaces. Confirm a useful action appears after advice, only a click navigates, the same conversation remains mounted, resumed actions are revalidated, and unavailable/disabled destinations fail safely.

Deliverable Subtasks: provider-neutral capability catalog and proposal contract; persisted and revalidated navigation resolution; accessible post-response actions; Superadmin platform-guidance contract.

## BOT-82 — Co-create and confirm an independent personal plan

Priority: High. Links: changes `PATHWAYS-G006-A004` and `PATHWAYS-G001-A003`. Depends on BOT-163 owner review; BOT-122/124 strengthens grounding but does not block the native editing foundation.

**Outcome** — A learner grants Hub a goal-scoped editing run in the native Plans workspace, follows its work on ordinary objects, and saves or cancels each object through the same edit actions they use themselves.

**Context** — The current editor mixes immediate writes, local object editors and modal creation. It has no shared multi-object edit-session contract, field reservation, recoverable unsaved state or durable agent activity/pointing.

**Build notes** — Use a split **Work on this plan** action, visible header grant, goal-directed cancellable run and general composer Stop control. Standardize native object-level Save/Cancel with multiple simultaneous editors. Reserve only the field Hub is changing, yield to learner focus/dirty state, show a calm shimmer, then animate a complete validated value. Retain saved/proposed/current provenance for comparison, customization and undo. Keep recovery records and revisions hidden from the learner-facing model. Create and confirm the plan before adding child objects. Condense transient activity while preserving clickable edited-object history and a review tray above the composer.

**Owner test scenarios** — Use the main split action to grant editing and its arrow to open without editing. Focus or change a field while Hub works and confirm Hub waits rather than overwriting it. Stop an answer and an edit run from the composer. Review several concurrently edited objects from the chat tray, customize and undo a proposal, then Save or Cancel normally. Confirm the new plan before Hub adds phases/objectives, reload recovered unsaved edits, follow historical chat events to pulse their objects, and explicitly finish the goal.

Deliverable Subtasks: BOT-169 hidden edit-session recovery; BOT-170 native multi-object editor contract; BOT-171 typed plan tools and field reservations; BOT-172 proposal provenance, review tray and pointing; BOT-173 plan-first idempotent creation; BOT-204 goal-scoped runs, activity, split grant, Stop and conclusion.

## BOT-174 — Review and apply proposed changes to an existing personal plan

Priority: Medium. Links: changes `PATHWAYS-G006-A004` and `PATHWAYS-G003-A006`. Depends on BOT-82 and all-writer revision audit.

**Outcome** — A learner previews an agent's proposed plan changes, edits them and applies exactly the reviewed version.

**Context** — Existing plans can change in another tab or through collaborators. Restoring old copies would overwrite later work.

**Build notes** — Base revisions across every relevant definition writer, field-aware comparison, atomic application, permission rechecks, attribution and guarded reversal. Group assignment definitions remain outside this capability.

**Owner test scenarios** — Revise a title/date/objective, inspect before/after and apply. Change the same field in a second tab and verify a conflict. Revoke permission before approval. Retry a lost response. Review a reversal after a later manual edit and verify it preserves that edit.

Deliverable Subtasks: BOT-175 shared definition revisions; BOT-176 native comparison/conflict resolution; BOT-177 atomic confirmed apply; BOT-178 guarded reversal.

## BOT-179 — Ground co-created plans in accessible badges and resources

Priority: Medium. Links: changes `PATHWAYS-G001-A003` and `PATHWAYS-G006-A004`. Depends on BOT-82 and BOT-122.

**Outcome** — A learner can include real accessible badges and learning resources in a plan draft without fabricated references or accidental enrollment.

**Boundary** — Resolve only server-supplied canonical candidates, distinguish references from enrollment/assignment, preview the real target, and revalidate access at apply.

Deliverable Subtasks: BOT-180 permission-filtered candidates; BOT-181 typed reference operations; BOT-182 native selective review; BOT-183 apply-time access validation.

## BOT-184 — Co-create confirmed portfolio experiences and project stories

Priority: Medium. Links: changes `PORTFOLIO-G002-A001/A002` and `PATHWAYS-G006-A004`. Depends on BOT-82's shared lifecycle; it may proceed independently of BOT-174 once that foundation is stable.

**Outcome** — A learner can turn conversation into an editable private Timeline or project draft, then add it to the portfolio explicitly.

**Boundary** — Keep media learner-controlled and separate an entry confirmation from overall portfolio publication or visibility changes.

Deliverable Subtasks: BOT-185 portfolio working copies; BOT-186 Timeline proposals; BOT-187 project proposals; BOT-188 confirmed permission-checked apply.

## BOT-189 — Turn learner reflections into confirmed private resource Notes

Priority: Medium. Links: changes `RESOURCES-G002-A003` and `PATHWAYS-G006-A004`. Depends on BOT-82 and the BOT-77/BOT-108 resource boundaries.

**Outcome** — Hub may offer an editable Note only for a substantive learner-authored reflection, and saves it only after confirmation.

**Boundary** — Questions, summaries, and passing reactions are not consent. Confirmation creates one private text block on the intended accessible resource; no silent Notes.

Deliverable Subtasks: BOT-190 reflection intent; BOT-191 editable Note proposal; BOT-192 idempotent private write; BOT-193 isolation, cancellation and replay safety.

## BOT-79 — Monitor and govern Hub models, capabilities, and action outcomes

Priority: Medium. Link: adds `PLATFORM-G006-A003`. Telemetry can proceed alongside learner co-creation; rollout controls and audits must precede staff/group actions.

**Outcome** — Superadmins can understand usage and failures, stage capabilities, set protective limits and audit confirmed outcomes without reading private learner content.

Deliverable Subtasks: BOT-199 privacy-bounded telemetry; BOT-200 operational dashboards; BOT-201 budgets/limits/kill switches; BOT-202 per-capability rollout; BOT-203 redacted action audits.

## BOT-194 — Co-create authorized learner and group-plan changes with staff

Priority: Low. Links: changes `PATHWAYS-G003-A006` and `PATHWAYS-G006-A004`. Depends on BOT-82, BOT-174 and BOT-79 rollout/audit controls.

**Outcome** — Authorized staff can prepare and review learner-specific or group-plan changes without widening authority or silently affecting participants.

**Boundary** — Separate staff capabilities by domain; disclose affected scope and participant count; preserve templates and peer plans; apply atomically under a deliberate rollout flag.

Deliverable Subtasks: BOT-195 scoped staff capabilities; BOT-196 learner-specific working copies; BOT-197 reviewed group batches; BOT-198 atomic audited apply.

## Explicitly outside this roadmap

* Unattended or background writes, generic arbitrary-code/URL/DOM tools, and model-manufactured approval.
* Automatic enrollment, assignment, plan completion/review, ownership transfer, messaging, or overall portfolio publication.
* External-service actions under BOT-83 and opportunities under BOT-84; each needs its own integration and authority model.

At implementation handoff update references and acceptance criteria, queue review notes and synchronize Jira; only the owner moves work to Done.
