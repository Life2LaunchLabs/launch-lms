# Product Operations-led Jira synchronization workflow

These instructions apply to the entire repository. Product Operations provides the local working copy for Jira
assignments, hierarchy, status, implementation notes, blockers, and delivery evidence. Jira is the shared remote
record at synchronization boundaries. The local SQLite database at `../productOS/workspaces/launch-lms/product.db` contains only the
durable product map: Group → Goal → Activity → optional Step. Jira working state and its pending outbox live in
the ignored, credential-free `../productOS/workspaces/launch-lms/.jira-cache.json`.

productOS is a separate sibling checkout, selected by its workspace configuration rather than nested in this app.
Local agents may assume both checkouts are available. A hosted runner must provide the same two-repository contract
and set `PRODUCTOS_WORKSPACE` when it does not use the default Launch LMS workspace.

Tester feedback uses the same Jira site but a separate FEED project, cache, and outbox. Follow
`../productOS/workspaces/launch-lms/FEEDBACK_WORKFLOW.md`: FEED is only intake and tester communication, BOT is the only delivery board,
and agent judgment is required for grouping, impact, sensitive content, public questions, and declines. Use
`../productOS/feedback.py` to acknowledge and group feedback, create or link BOT work, and propagate completed BOT
milestones back to FEED. Public tester replies must use the established `[Launch LMS reply]` prefix; keep analysis
under `[Launch LMS internal note]`.

Before product work, read `../productOS/README.md`, inspect the Story through `../productOS/jira.py show`, and
inspect its linked product-map Activities or Steps. Use local commands throughout the work; they update the
working copy and queue an outbox operation without contacting Jira. Use explicit `sync` at a suitable boundary
to push pending work with conflict checks and then pull the current board. `refresh` is pull-only and refuses to
overwrite pending local work. Jira credentials are server-only in `../productOS/workspaces/launch-lms/.env.local`; never print or
commit them. The files under `../productOS/workspaces/launch-lms/legacy-yaml/`, root `PRODUCT_ACTIVITY_HIERARCHY.md`, and
`user-story-map.yaml` are migration references only.

## Work board contract

The board primarily exists for the product owner to assign work to Codex.

- **Idea** contains the owner's rough sketches. Preserve their wording. Ideas are not implementation-ready.
- **To Do** contains formalized Stories and is Codex's authorized work queue. Any Story here is fair game to
  pick up unless the owner gives a more specific priority.
- **In Progress** means Codex has claimed and is actively delivering the Story.
- **In Review** means implementation and agent-run checks are complete and the Story is waiting for the product
  owner's review.
- **Done** is controlled by the product owner. Codex never moves a Story to Done.

Jira Subtasks are deliverables: concrete pieces of implementation that must be finished for the parent Story.
Do not create Subtasks for test commands, product-map Activities, user journey Steps, notes, or historical
events. Record implementation notes, blockers, checks, and evidence as Story comments.

A formalized Story description is deliberately short and uses exactly these sections:

1. **Outcome** — the user or operator result.
2. **Context** — the current behavior and information needed to understand the change.
3. **Build notes** — important constraints or technical direction; omit the section when none is needed.
4. **Owner test scenarios** — explicit behavior the product owner should exercise in review.

Set Priority directly and leave labels empty until the team defines a label taxonomy. Local changes remain
visible in Product Operations until synchronization completes.

## Agent workflow

Use the repository Jira helper from the repository root:

```bash
python3 ../productOS/jira.py board
python3 ../productOS/jira.py show BOT-123
python3 ../productOS/jira.py formalize BOT-123 --summary "Clear outcome" \
  --outcome "What becomes possible" \
  --context "Current behavior and relevant background" \
  --build-notes "Important implementation direction" \
  --test "Exact scenario the owner should exercise" \
  --deliverable "Concrete implementation result" \
  --priority High
python3 ../productOS/jira.py start BOT-123
python3 ../productOS/jira.py note BOT-123 "Decision, implementation note, or check evidence"
python3 ../productOS/jira.py block BOT-123 "What is blocked and what would unblock it"
python3 ../productOS/jira.py review BOT-123 --note "Implementation summary, automated checks, and manual review steps"
python3 ../productOS/jira.py sync
```

`board`, `show`, `formalize`, `start`, `note`, `block`, and `review` are local-only. They require no network or
Jira approval. `sync` is the only normal push operation: it verifies that affected remote issues still match the
timestamps in the local base snapshot, stops without pushing on conflict, sends the durable outbox, and refreshes
the working copy. `refresh` performs a read-only pull only when the outbox is empty.

When the owner asks to formalize an Idea, discover the existing behavior, write the compact Story description,
set Priority, add deliverable-only Subtasks, link durable product context, and move it to To Do. If the owner
also asks to build it, continue immediately to In Progress.

When choosing work independently, inspect the board and select a To Do Story. Before changing behavior:

1. Read the Jira Story and Subtasks.
2. Search the product map and codebase for existing, alternate, legacy, redirected, flagged, permission-gated,
   and service implementations supporting the same activity.
3. Link the Story to the affected Activity or Step. Add a planned Activity only when no existing one accurately
   represents the durable user outcome.
4. For any UI-affecting task, complete the design-readiness check in `../productOS/workspaces/launch-lms/design/README.md`:
   find existing briefs and selected mockups, identify affected surfaces/states/viewports, and record the visual
   reference and browser verification plan in a local Story note. Reuse sufficient references; otherwise write a
   scoped mockup commission before building the affected UI. Resolve material visual gaps with the owner early
   while continuing independent investigation or backend work. Small changes may use an annotated existing
   screenshot and a short change brief; do not require a fresh art pack or repeat an already settled decision.
5. Resolve material questions; then move the Story to In Progress.

During implementation, leave the Story In Progress. Record meaningful decisions, scope changes, blockers, and
verification evidence as local Story notes. If blocked, add the exact blocker and required resolution but leave
the Story In Progress unless the product owner directs otherwise. Sync these notes with Jira at a natural
checkpoint; do not interrupt implementation merely to push each operation individually.

When implementation is complete:

1. Update productOS workspace code/test references, relationships, health, acceptance criteria, and durable product
   state when the delivered behavior changes them.
2. Run appropriate automated, migration, security, accessibility, and design-system checks.
3. Add a handoff note with the implementation summary, executable evidence, and concise manual product
   checks for the owner.
4. Move the Story to In Review locally and sync the handoff. Do not move it to Done.

Automated checks are never product signoff. Preserve sunset and removed product Activities as tombstones.

The `dev` branch is protected and drives the unstable deployment. Do not attempt to push commits directly to
`dev`: push the delivery branch, open a pull request targeting `dev`, wait for all six required status checks,
and merge through GitHub. Keep the Jira Story in In Review until the product owner completes signoff.

For Launch LMS interface work, consult `apps/web/design-system/catalog.json` before adding components or
layouts. Reuse an adopted entry when it fits. When a new shared component is justified, update the catalog and
native preview and include design-system conformance evidence in the Jira handoff.

For UI handoff, inspect current browser-rendered screenshots against the selected references and exercise the
changed interactions at the agreed viewports. Record reference versions, implementation revision, capture paths,
checks, findings and any owner-accepted deviations in a task-specific report and link it in the Story. Fix material
differences before In Review. Builds, source inspection and screenshot existence alone are not visual verification.
If the browser, test data or references are unavailable, record exactly what is missing and the required resolution;
do not claim visual checks passed or treat an unverified UI as a completed handoff. Continue authorized work that
does not depend on the missing input. Never silently replace selected concepts or approve a new screenshot baseline
merely to make a comparison pass. The owner retains product signoff.

## Product-map commands

```bash
python3 ../productOS/product.py summary
python3 ../productOS/product.py goal list --group GROUP-ID
python3 ../productOS/product.py activity list --query "search terms"
python3 ../productOS/product.py activity show ACTIVITY-ID
python3 ../productOS/product.py step list --activity ACTIVITY-ID
python3 ../productOS/jira.py link BOT-123 --activity ACTIVITY-ID --type changes
python3 ../productOS/jira.py link BOT-123 --step STEP-ID --type fixes
```

Links may target Goals, Activities, or Steps and should use the effect that will occur when delivery completes:
`adds`, `changes`, `fixes`, `sunsets`, `removes`, or `verifies`; use `related` only for context that must not
change product state or verification. Prefer linking the deliverable Subtask when it owns a specific product-map
change. A completed linked deliverable applies lifecycle effects during Jira synchronization. The parent Story's
In Review state marks its direct and child links ready for manual verification; when the owner moves the Story to
Done, synchronization records the manual pass and signoff. The product hierarchy remains canonical in SQLite and
must not be duplicated into a separate Jira board.

SQLite integrity constraints are part of the product map. Use its CLI for routine changes. If direct SQL is
necessary, use a transaction and preserve permanent product-map IDs.
