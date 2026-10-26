# Insights dashboards

Status: building (I1 of I8) · Prototype: "Insights v3" artifact · Design: "Insights: how cards work, and the build plan" doc

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

## Acceptance

- Every measure has exact numbers on the `test_insights` fixture, and a staff viewer never counts a learner
  outside their groups (parametrized over the registry).
- Changes are called only when real (thresholds in `sentences.real_change`); too few rows say so.
- A bad spec on a dashboard returns its errors without failing the other cards.

## Sequence

I1 card engine · I2 dashboards API, templates, starter dashboards · I3 Insights page · I4 editing ·
I5 more measures (steps, reviews, retention, cross-org reach) and entry points · I6 captures · I7 MCP ·
I8 learner scope.

## Decisions

- Headlines are rule-written, never model-written.
- Sharing a dashboard with staff needs See reports; staff otherwise make personal dashboards.
- Captures are kept forever for now. No weekly brief card in v1.
- No org time zone or terms exist: UTC dates, presets plus custom ranges.
