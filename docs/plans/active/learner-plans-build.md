# Learner plans and badges: build plan

Status: planned. Builds the learner side agreed in design review (mockups:
https://claude.ai/artifact/56FkTtx8GsDWgGUtbYMssB) on today's models. Direction
and the longer-term model are in `badge-plan-unification.md`.

## Scope

In: Discover, badge detail, collection page, My plans, plan detail; the backend
those need (step availability, weekly focus for undated steps, badge plans,
collection marketing).

Out (later unification phases): credentials on requirement frameworks, route
templates, issuer rescoping, migrating learning paths into templates, the admin
plan editor, challenges (Discover shows a "coming soon" banner only).

## 1. Step availability (step-order rules)

Every objective gets a server-computed `availability`:

```
{ "state": "open" | "not_ready" | "done",
  "reason": null
          | { "kind": "opens", "date": "2026-12-17" }
          | { "kind": "after", "objective_uuid": "...", "title": "See it coming" } }
```

Inputs:

- `Plan.step_order`: `any` (default) | `in_order` | `by_chapter`.
  - `in_order`: a step is not ready until the previous step in plan order is
    done ("after").
  - `by_chapter`: a chapter opens when the previous chapter is done, or on its
    `start_date` if set ("opens" / "after" the last open step of the previous
    chapter).
- `PlanPhase.start_date` and `PlanObjective.start_date` in the future → "opens".
- `PlanObjective.after_objective_uuids` (new): explicit prerequisites → "after".
- `blocked` stays as a staff override and reads as not ready.

Template objectives and phases carry `step_order` and prerequisites into live
plans at materialization. Starting progress on a not-ready step is refused by
the API (409), so the UI muting is not the only guard.

## 2. Undated steps: weekly focus

Dated steps keep landing in the week or month they're due. Undated steps
(personal plans, badge plans, most templates) are paced:

- **Weekly target**: each learner has a target number of steps per week
  (default 5, changeable from My plans).
- **Filling the week**: on the first My plans load of a week, the server picks
  This week's steps: everything dated this week or overdue, unfinished picks
  carried over from last week, then undated *open* steps up to the target,
  taken round-robin across active plans (plan priority, then plan order). The
  picks are stored per learner per week so the week doesn't reshuffle.
- **Ready for more**: when every step picked for the week is done, This week
  offers "Ready for more", which adds up to 3 more open steps to the week (any
  time is fine; it is most prominent once the week is done).
- **Further ahead**: Next week previews the next batch the same way (not
  stored). Beyond that, dated steps group by month (year shown when it rolls
  over); undated steps that aren't in a week yet sit in **Later**, by plan.
- **Plan detail** ignores pacing and shows every step.

## 3. Activity objectives

Interactive activities stop living under badge paths. A new objective kind
`activity` carries an Activity Document (pages, blocks, flow, grading) on the
template objective; live plans reference it from their objective snapshot. The
existing player, grading, learner variables and Claude connector tools are
reused, keyed by plan objective instead of path. Completing the activity (with
grading where set) completes the objective.

**One connector.** The Claude connector stops having separate badge-activity
and plan-template halves: it edits plans. The plan template document gains the
`activity` objective type (its Activity Document inline or by reference), and
the activity tools (schema, validate, preview, save) are scoped to a template
objective instead of a badge version. Badge tools shrink to badge details and
which templates earn the badge.

## 4. Badges earned through plan templates

A badge is the credential and its details. What used to be its journey is one
or more plan templates the creator publishes with the badge ("routes"; one is
recommended).

- **Offering**: an issuer org's authorization for a badge says which routes it
  offers and how learners join (open / request / invite, as today).
- **Go**: clicking Start on a badge creates the learner's own plan from the
  chosen route, offered by the issuer org: an individual assignment from that
  org, the same path as an org assigning a plan. The learner owns the plan;
  issuer staff join it as reviewers and support/grade it like any assigned
  plan (`Plan.source_badge_id` links it to the badge).
- **Award**: issuer sign-off happens on the reviewed steps inside the plan.
  When every step is complete, the issuer org awards the badge automatically
  (new award source `plan_completion`).
- **Migration (auto-convert)**: each badge's active path becomes a published
  template with Activity steps (same content, chapters as phases, recommended
  route, `step_order` in order). Learners with an in-progress run get a plan
  from it with finished activities marked done; existing awards stay. The old
  path player is retired afterwards.
- A badge used as a step in another plan keeps working (badge objective); its
  card opens the learner's badge plan.

## 4. API

- Migration: `plan.step_order`, `program.step_order`, `plan.source_badge_id`,
  `planobjective.after_objective_uuids` (JSON), `badgecollection.collection_metadata`
  (JSON), new table `planweeklyfocus` (user, week start, objective ids, target,
  boosts).
- `GET /planning/home`: This week (picks, done count, can boost), Next week,
  months, Later, plans list.
- `POST /planning/home/more`: Ready for more.
- `PUT /planning/home/pace`: weekly target.
- Plan detail and feed objectives include `availability`.
- `POST /learning/badges/{uuid}/start` (route + issuer) creates or returns the
  badge plan; badge detail lists routes with their issuers and access.
- `GET /learning/collections/{uuid}`: public collection detail (badges with the
  viewer's state, marketing).
- Tests for availability rules, weekly fill, carry-over, boost, activity
  objectives, badge start/award, and the auto-convert migration.

## 5. Frontend

Shared:

- `StepStack` + `StepCard`: dotted timeline, plan-color tinted cards, states
  done / open / selected / not ready (muted, flat, reason in the meta line;
  selected shows the sentence and "Go to [step]").
- Plan color tokens (tint, edge, ring, main) derived from the existing plan
  color.

Pages:

- **My plans**: a light This week header with progress segmented by plan, the
  week's steps on the same card; Ready for more; Next week, months, Later;
  sidebar of plans with the single New plan entry (create your own / Discover).
- **Plan detail** (learner view): carousel header (neighbouring plans peek,
  dots; swipe on mobile), About this plan, full step stack opened at the next
  step. People with edit rights get "Edit plan", which opens today's editor.
- **Discover**: featured carousel, Keep going, Picked for you, one row per
  collection, Challenges coming-soon banner. Cards are badge art + name.
- **Badge detail**: hero, what it proves (Marketing overview cards),
  endorsement band, How you'll earn it ("Earn with [issuer]" from issuer
  authorizations + other ways; steps from the path), Collect the set.
- **Collection page**: new `/badges/collections/[uuid]`.
- **Admin**: collection marketing (credibility statement, endorsers with
  logos) on the collection admin page.

## Phases (one PR each, to `dev`)

1. Availability + weekly focus + `/planning/home` + tests.
2. StepStack, My plans, plan detail learner view.
3. Activity objectives.
4. Badge routes, start, issuer review, award on completion, auto-convert
   migration.
5. Discover, badge detail, collection page, collection marketing.
