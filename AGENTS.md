# Launch LMS agent map

This repository is the complete source of truth for the Launch LMS product. A
sibling checkout is never required to understand, build, test, or review it.

## Read before changing behavior

- [WORKFLOW.md](WORKFLOW.md) — delivery lifecycle, review, and handoff policy.
- [ARCHITECTURE.md](ARCHITECTURE.md) — applications, data, and dependency boundaries.
- [docs/product/README.md](docs/product/README.md) — durable product map and acceptance context.
- [docs/design/README.md](docs/design/README.md) — design readiness and visual verification.
- [docs/quality/README.md](docs/quality/README.md) — executable checks and debt ratchets.
- [docs/security/README.md](docs/security/README.md) and
  [docs/reliability/README.md](docs/reliability/README.md) — operating constraints.
- [docs/plans/README.md](docs/plans/README.md) — active plans and completed decisions.

Use `./scripts/agent doctor` from a clean checkout, `./scripts/agent check --changed`
during implementation, and `./scripts/agent check --all` before handoff.

## Work contract

- Idea preserves the owner's rough wording and is not implementation-ready.
- To Do holds authorized formalized Stories/Tasks. Symphony dispatch additionally
  requires the `symphony` label on a non-subtask parent. Never label subtasks.
- In Progress means implementation, checks, merge or deployment verification is
  underway. Resume only work owned by this runner or explicitly assigned by owner.
- In Review means delivery and agent checks are complete; owner signoff remains.
- Done is owner-controlled. Agents never move parent or subtasks to Done.

Read the parent, all deliverable subtasks, comments, issue links, related docs,
product-map nodes, and existing/alternate/legacy/permission-gated implementations
before changing behavior.
Subtasks represent implementation deliverables, never test commands or notes.
Formalized descriptions use Outcome, Context, optional Build notes, and Owner test
scenarios. Set Priority directly; `symphony` is the explicit execution opt-in label.
Preserve other labels. Record planning, decisions, blockers and evidence in one
persistent Jira `Symphony workpad` comment. Use the native jira_rest tool under
Symphony; outside Symphony use authenticated Jira REST without logging credentials.
Jira writes are authorized within the assigned task; no extra sync approval step.

## Delivery

Never push directly to dev/main or bypass branch rules. Push a delivery branch,
create a PR targeting dev, and wait for all six required checks on its latest head
and any browser checks. Merge only after the owner moves the exact revision to
Merge; use matching-head protection and re-check approval after any head change.
Verify the resulting checked candidate actually deploys to life2launch.dev before
moving deliverables and parent to In Review. Never deploy production from a task.

Run appropriate automated, migration, security, accessibility, and design-system
checks. Keep product data and references current; preserve removed/sunset outcomes
as history. Include exact checks, PR/commit/deploy links, and owner test steps.

## Interface work

Complete [design readiness](docs/design/README.md) before UI changes. Read
apps/web/design-system/catalog.json and reuse adopted components. When a new shared
component is justified, update its catalog entry and native preview. Record affected
surfaces/states/viewports, selected reference versions and browser plan in the
workpad. Small changes may use an annotated existing screenshot and short brief.
Reuse settled references; commission only material missing design direction.

Before UI handoff inspect current browser-rendered screenshots against the selected
references and exercise changed interactions at agreed desktop/mobile viewports.
Record reference versions, implementation revision, capture paths, commands,
findings and owner-accepted deviations in a task-specific report linked from Jira.
Fix material differences before In Review. Builds, source inspection or screenshot
existence alone are not visual verification. Missing browser, fixtures, access or
references is an exact blocker; continue independent work but never claim a pass,
silently replace a selected concept or approve your own screenshot baseline.

## Boundaries

BOT is the only delivery queue. FEED is tester communication, never implementation
authority. Symphony runtime/deployment lives in the operations repository; the
product-specific prompt is this repository's [WORKFLOW.md](WORKFLOW.md). Never
expose credentials or private learner data in comments, captures, or artifacts.
