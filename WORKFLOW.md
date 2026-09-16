# Launch LMS delivery workflow

This is the canonical product-specific prompt used by interactive agents and by
the operations platform when it renders a Symphony workflow. Runtime credentials,
model selection, concurrency, and host paths do not belong here.

## Prepare

1. Read `AGENTS.md`, the assigned Jira parent, its deliverable subtasks, comments,
   links, and affected product-map nodes.
2. Inspect existing, alternate, legacy, redirected, flagged, permission-gated,
   and service implementations before changing behavior.
3. For interface work, follow `docs/design/README.md` and record references,
   states, viewports, and the browser verification plan.
4. Start from current `origin/dev`, preserve unrelated work, and keep one Jira
   workpad current with plan, decisions, evidence, and blockers.

## Deliver

- Implement the complete scoped outcome and deliverable subtasks.
- Keep product data, architecture, tests, design history, and docs accurate.
- Use `./scripts/agent check --changed` while iterating and all applicable checks
  before handoff.
- Push a delivery branch and open a PR targeting `dev`. Never push directly to a
  protected branch or use administrator bypasses.
- Resolve actionable feedback. Changed code invalidates earlier evidence.

## Interface evidence

Drive the real application with synthetic fixtures. Inspect reference and actual
captures at agreed desktop and phone viewports, exercise keyboard/focus and error
states, and write a task-specific report. Builds, source review, or screenshot
existence are not visual verification. Missing inputs are explicit blockers.

## Review, merge, and deploy

Move work to In Review only after implementation, checks, and evidence are
complete. The owner approves an exact revision by moving the parent to Merge.
Before merging, verify the approval record, PR head, review threads, and required
checks again. Merge with head-SHA protection, watch the dev candidate and matched
operations deployment, and record the deployed revision. Only the owner moves
work to Done.

If blocked, record the missing input and safe continuation point. Never invent
approval, weaken a check, expose secrets/private learner data, process FEED as
delivery work, or retry indefinitely.
