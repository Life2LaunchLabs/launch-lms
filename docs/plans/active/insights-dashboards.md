# Insights dashboards

Status: building (I3 of I8) · Prototype: "Insights v3" artifact · Design: "Insights: how cards work, and the build plan" doc

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
