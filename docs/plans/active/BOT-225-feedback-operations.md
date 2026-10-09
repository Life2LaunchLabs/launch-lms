# BOT-225 — feedback intake and delivery operations

## Objective

Make feedback review available locally and through Symphony from this repository,
while keeping agent judgment in intake and deterministic BOT-to-FEED movement in
an idempotent automation boundary.

## Acceptance

- BOT and FEED can be read with isolated project configuration and no credential
  material in output or repository files.
- An audit lists every feedback item, its durable triage state, native BOT links,
  and concepts ordered by impact, report count, and age.
- Applying triage requires a public note when the feedback lifecycle changes and
  records grouping, disposition, impact, and rationale in Jira.
- Delivery work exists only in BOT and uses native Jira issue links.
- Reconciliation follows policy-defined semantic roles, posts only the
  ready-to-test message, recovers missed events, and suppresses duplicates.
- Tester confirmation and reopening remain safe across later reconciliation.

## Progress

- [x] Recovered BOT-225 and current FEED through the legacy credential boundary.
- [x] Moved BOT-225 to In Progress and created its Symphony workpad.
- [x] Added repository-owned Jira and feedback commands plus policy schema v2.
- [x] Added durable Jira-property triage and native FEED↔BOT link handling.
- [x] Added deterministic, dry-run-first reconciliation and reopen handling.
- [x] Complete automated checks and a live doctor/audit dry run.
- [x] Review and apply the first feedback intake cycle.

## Decisions

- Jira is the durable workflow store. Local JSON is output/evidence, not hidden
  lifecycle state.
- FEED's current To Do/In Progress/Done statuses map to intake/active/ready to
  test. Disposition and confirmation labels distinguish terminal outcomes.
- `In Review` is a ready-to-test BOT milestone because Launch workflow requires
  the candidate revision to be deployed before that state.
- Commands default to dry-run; only explicit `--apply` mutations write Jira.

## Verification and recovery

Run focused unit/API checks, `./scripts/agent feedback ... doctor`, a live audit,
and `./scripts/agent check --changed`. Jira writes are idempotent properties,
labels, links, transitions, and prefixed comments. If a live apply fails, rerun a
read-only audit before retrying; do not edit or delete historical comments.

## First intake audit

Snapshot: 2026-09-22 17:40 UTC. The review used the isolated legacy FEED and BOT
caches and excludes submitter identity and private reproduction data. Live Jira
must be refreshed before applying this plan.

| Feedback | Impact | Disposition and delivery action |
| --- | ---: | --- |
| FEED-1 | 1 | Already handled as an ignored smoke test; preserve the history. |
| FEED-2 | 1 | Positive evidence, not delivery scope. Migrate its triage property and move it to the handled state with a short closing reply. |
| FEED-3 | 3 | Migrate native links to BOT-219 and BOT-222. BOT-219's delivered subtasks and parent status disagree; reconcile that parent with delivery evidence. Prioritize the still-unresolved BOT-222 release-note defect. |
| FEED-4 | 3 | Migrate its native BOT-219 link. Do not create duplicate work. |
| FEED-5 | 4 | Migrate its native BOT-217 link. BOT-217 is complete, so reconciliation should move the report to ready-to-test and publish the single configured test request. |
| FEED-6 | 3 | Treat panel preloading as planned scope and link it to BOT-248, whose BOT-250 deliverable owns the replacement feedback/release-note surface. Do not create parallel app-owned scope. |
| FEED-7 | 3 | Treat follow-up image attachment as planned scope and link it to BOT-248/BOT-250 through the BOT-248 parent. Add it explicitly to that parent's acceptance context before delivery. |
| FEED-8 | 1 | Mark invalid test data, retain it, and close it with a concise creator-visible explanation. Do not delete it. |
| FEED-9 | 5 | Create a new Highest-priority BOT defect for the authenticated Portfolio redirect/access failure, with reproduction and session-boundary diagnostics as deliverables. |
| FEED-10 | 2 | Create a separate Medium-priority BOT accessibility/usability task for a keyboard- and screen-reader-safe password visibility control. |

Service order for new attention is FEED-9, FEED-5, then FEED-3/4/6/7. FEED-9
is the only unlinked report currently indicating a blocked core journey. BOT-222
is the highest-priority already-formalized unresolved feedback item.

Proposed intake replies are deliberately short and only accompany a lifecycle
transition:

- FEED-6: “Thanks—these panels should feel immediate. We linked this to the
  replacement operations surface and will ask you to test it when ready.”
- FEED-7: “Good idea. We linked follow-up image attachments to the feedback
  surface work and will ask you to test it when ready.”
- FEED-8: “Thanks—we confirmed this was a test submission, so we are closing it
  without creating product work.”
- FEED-9: “Thanks for flagging this. Being redirected away from Portfolio blocks
  a core workflow, so we are treating it as our highest-priority new defect.”
- FEED-10: “Good idea. We will add a safe show/hide-password control and ask
  you to test it when it is ready.”

## Applied intake result

Applied 2026-09-22 after a fresh live doctor and audit:

- Migrated FEED-2 through FEED-5 to Jira properties and native issue links.
- Triaged all ten FEED items; the final audit contains no untriaged reports and
  no remaining legacy migration work.
- Linked FEED-6 and FEED-7 to active replacement-surface parent BOT-248.
- Created Highest-priority BOT-267 with BOT-268/BOT-269 for the Portfolio access
  defect and Medium-priority BOT-270 with BOT-271/BOT-272 for password visibility.
- Reconciled completed BOT-217 into FEED-5 Done and published its one-time
  ready-to-test request. A second reconciliation produced no operations.
- Kept FEED-1, FEED-2, and FEED-8 as handled history without manufacturing BOT
  delivery work.
