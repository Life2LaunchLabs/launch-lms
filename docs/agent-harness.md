# Unattended delivery

## Map

- apps/api: FastAPI, SQLModel, Alembic; Python dependencies in pyproject.toml/uv.lock.
- apps/web: Next.js frontend; adopted components in design-system/catalog.json.
- scripts/ci: image smoke, release contract and browser test setup.
- .github/workflows/build-community.yaml: required candidate checks and publishing.
- scripts/docs/deployment.md: checked-image deployment and promotion contract.
- docs/design/README.md: selected-reference index and browser handoff requirements.
- launch-lms-infra (separate repository): Compose, deployment and Symphony runtime.

The runner clones this repository from dev per Jira parent. Workspaces and Codex
sessions persist on the dev host; never assume a fresh workspace on retries. Fetch
Jira comments and inspect Git/PR state before taking action. Keep one workpad comment
updated in place using Jira ADF; include plan, acceptance criteria, evidence and
blockers. Do not put credentials or private learner data into comments/artifacts.

## Jira REST examples

Use Symphony's jira_rest tool. GET /rest/api/3/issue/BOT-N with fields
summary,description,status,issuetype,subtasks,labels,issuelinks; paginate comments at
/rest/api/3/issue/BOT-N/comment. GET /rest/api/3/issue/BOT-N/transitions discovers
IDs; POST the chosen ID to that same path. Never assume IDs across Jira sites.

ADF comment body:
`{"body":{"type":"doc","version":1,"content":[{"type":"paragraph","content":[{"type":"text","text":"Symphony workpad\nPlan and evidence..."}]}]}}`

POST the body to /rest/api/3/issue/BOT-N/comment, then PUT updates to the returned
comment ID. To suspend a blocked task, PUT
`{"update":{"labels":[{"remove":"symphony"}]}}` to /rest/api/3/issue/BOT-N.
Leave it In Progress and document the exact unblocking action. Re-add symphony to
resume after resolution. Never queue subtasks, Ideas or FEED.

## Checks and merge

Use existing workflow commands as executable source of truth. For API tests:
`cd apps/api && TESTING=true uv run pytest src/tests/<relevant_test>.py`.
Install project dependencies with uv sync before testing. Use declared Ruff tooling
when available. Frontend checks follow apps/web/package.json and the web/browser
workflows. Do not reformat the whole repository to make a scoped task pass.

Use `gh pr checks <number> --required` and `gh pr view <number> --json
headRefOid,mergeStateStatus,statusCheckRollup,reviews` to inspect the current head.
The six required contexts are contract, api-lint / ruff, api-tests / test,
migrations / alembic-heads, Build and smoke (amd64), Build and smoke (arm64).
Require browser-ui success when it runs too. Resolve actionable PR comments and
review threads; if dev advanced, merge it and validate the new head. Merge with
`gh pr merge <number> --squash --match-head-commit <tested-head-sha>`.
Do not use --admin or alter protections. Owner has authorized this checked merge.

## Deployment evidence

A merged PR triggers `Build Community Images` on dev. Successful candidate publishing
sends unstable-candidate to launch-lms-infra and starts `Deploy environment`.
Watch the app run for the merge SHA and the matching infra dispatch run, including
its candidate commit in logs. Both must succeed. The public build endpoint is
https://life2launch.dev/api/v1/instance/build and returns commit_sha plus image
metadata. If a tester HTTP gate requires credentials, do not invent or bypass them:
use the infra deployment's successful verification log and matched commit evidence,
or report the missing verification access. Never infer deployment from a merge.
A later deployed dev descendant is acceptable only after ancestry verification.

Put PR, merge SHA, candidate run, matched successful deployment run and deployed
commit evidence in the workpad. Only then transition completed subtasks and parent
to In Review. If checks/deployment fail, investigate within scope and record exact
blockers; do not mark In Review prematurely. Never move to Done.

## Recovery and limits

The initial dev runner has one agent, 2300 MiB and 1.5 CPU. It has no host Docker
socket or production access. Run heavyweight image checks in GitHub Actions. Do not
attempt a privileged Docker install or change the running app directly. A killed
agent resumes from its Git tree/workpad after service restart; inspect for partial
commits, existing PRs and already-merged work first. Runtime pause/resume and login
rotation are documented in launch-lms-infra/symphony/README.md.

Product-map maintenance and FEED operations are paused with productOS; preserve
existing references, but neither can block otherwise authorized backend delivery.
UI evidence remains required. For missing material design decisions, leave a precise
blocker and remove the dispatch label so other ready work can proceed.
