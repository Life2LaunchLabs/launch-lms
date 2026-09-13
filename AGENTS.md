# Launch LMS delivery harness

The owner moved unattended delivery to Symphony on life2launch.dev in September
2026. Jira BOT is the delivery authority. productOS is archived product context;
a sibling checkout, SQLite product map, local Jira cache and outbox synchronization
are no longer prerequisites. Do not run productOS writes or FEED automation.

Read [docs/agent-harness.md](docs/agent-harness.md) before delivery work. Symphony's
versioned runtime workflow lives in launch-lms-infra/symphony/WORKFLOW.md.

## Work contract

- Idea preserves the owner's rough wording and is not implementation-ready.
- To Do holds authorized formalized Stories/Tasks. Symphony dispatch additionally
  requires the `symphony` label on a non-subtask parent. Never label subtasks.
- In Progress means implementation, checks, merge or deployment verification is
  underway. Resume only work owned by this runner or explicitly assigned by owner.
- In Review means delivery and agent checks are complete; owner signoff remains.
- Done is owner-controlled. Agents never move parent or subtasks to Done.

Read the parent, all deliverable subtasks, comments, issue links, related docs and
existing/alternate/legacy/permission-gated implementations before changing behavior.
Subtasks represent implementation deliverables, never test commands or notes.
Formalized descriptions use Outcome, Context, optional Build notes, and Owner test
scenarios. Set Priority directly; `symphony` is the explicit execution opt-in label.
Preserve other labels. Record planning, decisions, blockers and evidence in one
persistent Jira `Symphony workpad` comment. Use the native jira_rest tool under
Symphony; outside Symphony use authenticated Jira REST without logging credentials.
Jira writes are authorized within the assigned task; no extra sync approval step.

## Delivery

The owner authorizes unattended PR merges into dev after all checks and review
feedback are resolved. Never push directly to dev/main or bypass branch rules.
Push a delivery branch, create a PR targeting dev, wait for all six required checks
on its latest head and any browser checks, then merge with matching head SHA.
Verify the resulting checked candidate actually deploys to life2launch.dev before
moving deliverables and parent to In Review. Never deploy production from a task.

Run appropriate automated, migration, security, accessibility and design-system
checks for the change. Keep durable app code/test/docs references current in the
repository. Preserve removed/sunset outcomes as historical context. Include exact
check results, PR/commit/deploy links and concise owner test steps in the handoff.
Automated checks are never product signoff.

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

## Feedback

FEED remains tester intake, collected directly by the running application into Jira.
Automatic triage, acknowledgement and BOT-to-FEED propagation are paused. Symphony
must not process FEED or send tester replies. Keep the app's feedback collection and
configuration intact. BOT is the only delivery queue.
