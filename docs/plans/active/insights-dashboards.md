# Insights dashboards

Status: building (I7 of I8) · Prototype: "Insights v3" artifact · Design: "Insights: how cards work, and the build plan" doc

## Objective

Replace the per-group report with dashboards that answer the same questions for any object: the
organization (overview), one plan, one group, and next one learner. Every dashboard is made of cards; a
card is a JSON spec run by one engine, so templates, the question library, the card editor and the MCP
all produce the same thing. Reports are captures of a dashboard, kept in a log inside it.

## Cards (I1)

`apps/api/src/services/insights/`:

| Module | What it holds |
|---|---|
| `spec.py` | `CardSpec` (measure, by, by2, filters, range, compare, chart, headline) and `check`, the one validator |
| `context.py` | The viewer's population (admins and See reports: every learner; other staff: their groups' and assignments' learners), the dashboard scope, date windows |
| `measures.py` | The measure registry. Each measure loads facts (date, dimension keys, num/den or value) and carries its definition, unit, direction and phrasing |
| `dimensions.py` | Breakdowns: time, plan, group, version, status, route; labels, sort, and which open another dashboard |
| `engine.py` | Spec → result: filter, window, compare, group, chart choice, drill keys; `drill` lists the learners behind a value |
| `sentences.py` | Headline rules per result shape, and when a change counts |

Measures read existing tables: goals, `PlanActivity` (every step status change, with actor and time),
`StepProgress`, `BadgeAward`, memberships and conversation messages. No new tables for I1.

API (`routers/insights.py`, prefix `/insights`): `GET /registry`, `POST /cards/run`, `POST /drill`, all
with `org_id`.

## Dashboards (I2)

`InsightDashboard` (`db/insights.py`): scope, title, visibility (`me`, `staff`, `admins`), owner, a
document of cards (`{key, spec, span}`) and a default range, a revision, the template it came from, and a
soft delete. `services/insights/dashboards.py` holds the rules:

- Sharing with staff needs See reports; sharing with admins only needs an admin.
- The owner, or an admin on a shared dashboard, saves in place at the revision they opened (409 with the
  current dashboard otherwise). Anyone else's save makes their own copy.
- Every card is checked against the dashboard's scope when saved; a card the viewer may not run shows locked.
- The first time an organization opens Insights it gets the starters (org overview, plan performance,
  group progress) shared with staff. Deleting them keeps them gone.

`services/insights/library.py` holds the templates per scope and the question library, all plain specs.

API: `GET /library`, `GET /objects` (plans or groups for the switcher), `GET|POST /dashboards`, `GET|PUT|DELETE /dashboards/{uuid}`,
`POST /dashboards/{uuid}/duplicate`, all with `org_id`.

## Insights page (I3)

`components/Insights/`: a rail (the org's dashboards; Plans and Groups, one at a time; then group reports,
requirement coverage and learner evidence), and the open dashboard. A plan or group dashboard has a switcher
for which plan or group, and tabs for the dashboards of that kind. Cards run in one request per dashboard
and date range. Lines and columns use Recharts; ranked bars, splits and heatmaps are HTML so every value is
a button that opens the learners behind it, and a plan or group row links to its own dashboard. Chart
colors are tokens in `insights.css`, with their own dark steps.

Routes: `/admin/insights?d=`, `/admin/insights/plan/[key]?d=`, `/admin/insights/group/[key]?d=`. Group
reports moved to `/admin/insights/reports`; old `?group=` links redirect.

## Editing (I4)

Edit turns the dashboard into a draft: cards move, resize (small, medium, large, wide), change or go, and
Add a card opens the card editor on the question library or a blank card. The editor maps each choice to one
spec field (show, by, and by, who, dates, compare, size, headline, chart) and re-runs a live preview, so
server validation shows on the card itself. Done saves the whole document at the opened revision; a stale
revision keeps the draft and says so, and a viewer who can't save over the dashboard gets their own copy.

## More measures (I5)

`measures_steps.py` adds step reach (plan dashboards; by step it reads as a funnel and the headline names the
biggest drop), sent back, review turnaround (hours from hand-in to decision, from `PlanActivity`), waiting
for review (today), retention (active again 30 to 60 days after joining) and reach (learners at every
organization who started the plan; totals and organization names only, never a list of people). Steps match
across learners by template key and sort in plan order; the step and organization breakdowns only fit plan
dashboards. Ranked headlines now pick leader and laggard by value, so versions and steps read right. The
plan page has an Insights button for its owner.

## Captures (I6)

`InsightCapture` (`db/insights.py`) is a dashboard frozen at a moment: the cards and every card's result as
the capturer saw them, the plan or group and its name, the dates asked for and covered, a note, whose
learners it counted, and `attachments` (material made with it, registered in `captures.ATTACHMENTS`; a
requirement report adds each learner's evidence). Nothing re-runs when a capture opens, and captures outlive
their dashboard. `services/insights/captures.py` holds the rules:

- Its maker opens it; so does anyone with See reports who can see its dashboard. Staff without See reports
  see only their own.
- Only its maker changes the note; the numbers never change.
- Its maker or an admin turns on a read-only link (7, 30 or 90 days, or until turned off). The link shows the
  cards with no drill keys or row links, no names, and any number resting on fewer than ten shown as
  "fewer than 10" and left out of the headline (`shield`); attachments show only when their kind is public.

API: `POST /dashboards/{uuid}/captures`, `GET /captures` (filters: dashboard, scope, key, mine, scheduled),
`GET /captures/{uuid}`, `PUT /captures/{uuid}/note`, `PUT /captures/{uuid}/link`, and `GET /shared/{token}`
with no sign-in. Web: Capture on a dashboard's header, the log at `/admin/insights/captures`, one capture at
`/admin/insights/captures/[uuid]` (print and the link), and the link at `/insights/shared/[token]`.
Scheduled captures (I6b): `InsightCaptureRule` captures a dashboard weekly (a weekday), monthly (a day, or
the last) or once on a date, at 06:00 UTC, as its owner, with a note and optional fixed dates.
`services/insights/rules.py` claims due rules (moving their next run on in one commit, `SKIP LOCKED` on
Postgres) before running them, from a loop started with the app (`run_forever`). Staff recipients must be
able to open the capture and get a link into Insights; other addresses get the read-only link, so a rule
with addresses makes one each run. Emails list the shielded headlines. A rule that can't run (dashboard
deleted, owner gone, plan or group no longer theirs) turns itself off with the reason. API: `GET /rules`,
`POST /dashboards/{uuid}/rules`, `PUT|DELETE /rules/{uuid}`, `POST /rules/{uuid}/run`. Web: Schedule
captures in a dashboard's menu, and Schedules above the capture log.

## Claude tools (I7)

Ten MCP tools in `services/insights/mcp.py`, listed in `services/mcp/insights_tools.py` under two new scopes,
`insights:read` and `insights:write` (connections made before them must reconnect). Read:
`get_dashboard_schema` (the guide, the card spec's JSON Schema, and for a scope the measures, breakdowns,
charts, templates and questions), `list_dashboards` (with the plans or groups to open one on),
`get_dashboard` (with `run`, each card's numbers for a key), `validate_dashboard`, `preview_card` and
`list_captures`. Write: `create_dashboard`, `save_dashboard` (the revision is the etag; a stale one gets
409 with the current dashboard), `capture_dashboard` and `save_capture_rule` (fields left out of a change
keep their value). Every tool acts as the connected person, through the same services as the app, so it
sees and may share only what they could in Insights.

## Acceptance

- Every measure has exact numbers on the `test_insights` fixture, and a staff viewer never counts a learner
  outside their groups (parametrized over the registry).
- Changes are called only when real (thresholds in `sentences.real_change`); too few rows say so.
- A bad spec on a dashboard returns its errors without failing the other cards.
- Every template and question validates on its scope, and every starter runs without errors.
- `tests/ui/insights.spec.ts`: the org overview runs its cards, opens who is behind a number, changes dates; a
  group dashboard switches groups; New dashboard makes one from a template.

## Sequence

I1 card engine · I2 dashboards API, templates, starter dashboards · I3 Insights page · I4 editing ·
I5 more measures (steps, reviews, retention, cross-org reach) and entry points · I6 captures · I7 MCP ·
I8 learner scope.

## Decisions

- Headlines are rule-written, never model-written.
- Sharing a dashboard with staff needs See reports; staff otherwise make personal dashboards.
- Captures are kept forever for now. No weekly brief card in v1.
- No org time zone or terms exist: UTC dates, presets plus custom ranges.
