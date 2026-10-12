# Badges and plans: one engine (partly built)

Status: the first half is built (see `learner-plans-build.md`, PRs #108–#113).
Activities are plan objectives, badges are earned through plan templates
(routes), badge learning paths are gone, and onboarding is a starter plan. Not
yet built: credentials on requirement frameworks, plan composition, push-to-
active-plans and issuer rescoping to credential + route. "Problem" below
describes the model before that work.

## Problem

Badges and plans have grown into two parallel ways of guiding a learner
through steps:

- A **badge** owns a learning path (`LearningBadge` → `LearningBadgeVersion` →
  `LearningPath` → `LearningActivity` → `LearningPage`), with interactive
  activities (blocks, questions, branching flow, learner variables), runs
  (`LearningRun`, `LearningActivityRun`, `LearningPageProgress`), issuer orgs
  (`BadgeIssuerAuthorization`, `BadgeIssuerLearnerLink`) and Open Badges awards
  (`LearningBadgeAward`).
- A **plan** (template → live `Plan`) owns phases and objectives of any kind,
  collaborators, schedules and requirement links.

When a counselor puts a badge in a plan, badge activities can surface as plan
objectives that mirror the badge page closely enough to confuse learners ("am I
in my plan or in the badge?"). Badge creators can't mix activities with other
kinds of steps (uploads, events, real-world actions), and there are two
assignment ideas (badge vs. plan). `LearningRun` already carries `plan_id` /
`plan_objective_id`, so badge runs are partly linked to plans today.

## Model

Plans are the only way of guiding a learner through steps. A credential is
what a plan can earn you.

1. **Activity is a plan objective type.** The interactive activity (Activity
   Document: pages, blocks, flow, outcomes; in practice learning content plus
   a graded form) stays as it is, but lives in a plan objective rather than
   under a badge path. It can appear in any plan; credential-earning plans just
   lean on activities more. No standalone activity library: reuse an activity
   by reusing the template it sits in. The coach generates one by adding an
   Activity objective to a plan.
2. **No "pathway" concept.** A badge's learning path converts to an ordinary
   plan template. What makes it special is only that a credential accepts it
   as a route.
3. **A credential is defined at the requirement level.** Requirement frameworks
   already have draft → published versions, nodes, objective ↔ node mappings
   and credit from completed objectives (`RequirementAttainmentSource`). A
   credential = a published requirement framework version + award details
   (name, image, creator org, Open Badges metadata). It is earned when its
   nodes are attained.
4. **Several routes, no OR logic.** A route is a plan template the creator
   approves for the credential. Every route maps its objectives onto the same
   nodes at different granularity: the full route maps ten activities to one or
   two nodes each; a "teacher write-up" route maps one reviewed objective to
   all of them; an "admin confer with note" route is one objective too. Adding
   a route never changes the criteria. Credit is per node, so a learner who
   switches routes keeps what they've attained.
5. **Plans reference, they don't copy.** Adding a credential route to a plan
   adds one objective ("Earn Workplace Communication") that shows progress and
   opens the route as its own track. One route instance per learner per
   credential, shared by every plan that references it, so it is completed once
   and satisfies all of them. The learner can't edit its steps but can build
   their own objectives around it. Starting a badge creates its route instance
   as a plan of its own; referencing it from another plan is a deliberate step
   taken inside that plan.
6. **Objectives write learner data.** Activities already set learner variables.
   Other objective types (Create, Decide, …) feed the same learner data store,
   e.g. portfolio items, so "what the learner said/made" has one home whatever
   step produced it.

### Objective types (agreed in design review)

Event (scheduled; includes scheduled conversations) · Action (real-world, check
off; includes unscheduled "talk to someone") · Explore (resources) · Activity
(interactive, in-app; authored or coach-generated) · Create (make something
that's yours, in-app or upload; "get feedback", not "hand it in"; feeds the
portfolio) · Decide (a choice and its reasons) · plus the **Credential** card
(a reference to a route instance, not really a type).

## Orgs, access and permissions

Creator and issuer are **organizations**, as today; users act within them
through their org roles.

- **Creator org** owns the credential: requirements, approved routes, and
  policy:
  - *Approved routes only* (default) vs. *any plan* — whether credit from
    objectives in custom plans that map to the nodes counts (issuer reviews
    them).
  - Whether approved route templates are locked (issuers deliver them as-is)
    or issuers may adapt them.
- **Issuer org** is authorized to deliver, grade and confer
  (`BadgeIssuerAuthorization` carries over, scoped to credential instead of
  badge). It reviews objectives that need sign-off; under a locked policy it
  only grades. Authorization may name which routes it offers.
- **Learner access is per issuer + route**, carrying over `learner_access`:
  *open* (start now), *request* (issuer accepts; `BadgeIssuerLearnerLink`) or
  *invite*. Learners can start credentials themselves through open/request
  routes. Routes a learner can't access (e.g. admin confer with note) are not
  shown to them at all.
- Within an org, users differ: who can author routes, who can assign a route
  into a learner's plan, who can sign off. Assigning and signing off stay
  separate permissions.

## Template changes on active plans

Admins need to push template changes to live plans (credential routes and
ordinary templates alike). Start simple:

- Editing a template and choosing **Push to active plans** shows a preview of
  affected plans before applying.
- Per objective, by learner state: added objectives are inserted; content
  edits apply to not-started and in-progress objectives; completed objectives
  are left alone; removed objectives disappear if not started and stay
  (marked retired) if started or completed.
- Credential progress is safe either way because credit is held per
  requirement node, not per objective. Only a change to the credential's
  *requirements* needs a new requirement framework version (existing
  versioning), with `accept_previous_major_versions`-style rules for earners
  in progress.

No separate plan-template versioning until this proves insufficient.

## Learner side and discovery

Learners see **badges** (the credential, by its learner-facing name) and
**challenges** (coming soon). Plans without a badge are not part of discovery;
they live in My plans.

- **Discover** is a content-discovery surface (Epic Games Store / YouTube
  patterns): an image-led featured carousel, a "Keep going" row with progress,
  badge carousels (picked for you, series to collect), and an image-led
  challenges banner. Cards are mostly badge art plus a name.
- **Badge page** sells the badge for its own sake: big hero with the badge art,
  what it proves, how it travels (verified, shareable, Open Badges), how you'll
  earn it (recommended route, "Earn it another way" for the other routes you
  can access), and the rest of its series.
- **Collection page** per series: progress through the set, your next badge,
  every badge with its state, and the creator's endorsements.
- **Marketing content** on badge and collection pages ("what it proves", the
  creator's credibility statement, "endorsed by" logos) comes from the
  Marketing tab in the creator's admin panel.
- **"How you'll earn it"** leads with the recommended route as a header
  ("Earn with [issuer org]", effort, Start) with "N other ways" beside it, and
  the steps underneath.
- **Starting is one tap.** Starting a badge starts its route and it appears in
  My plans; no "add to which plan" choice. Making a badge a step in another plan
  is a deliberate action taken from inside that plan.
- **Steps are one card stack everywhere.** My plans and plan detail use the
  same step cards (tinted in the plan's color) on a dotted timeline. Selecting
  a card expands it in place with its description and Start; any open step can
  be picked, not just the next one. Plans follow a step-order rule (steps in
  order, chapters open on schedule, or any order), so a step can be not ready.
  A not-ready step is quietly muted (grey, flat, no 3D edge), never shown as an
  error, and states its reason: "Opens Dec 17" or "After [linked step]", with a
  "Go to [linked step]" button when selected.
- **My plans** opens on **This week**: progress made this week (a bar
  segmented by plan) and the stack of this week's steps across plans with the
  next one selected. Scroll down for the future, grouped as Next week, then by
  month, marking the year when it rolls over. No completed history beyond this
  week. A sidebar lists your plans and, below them, the one "New plan" entry
  (create your own with Hub, or find one in Discover).
- **Plan detail** looks the same for every kind of plan and continues the badge
  page: a header with the plan's art, source ("from Discover", "from
  [school]", "your plan"), goal, progress and step-order rule, with details
  behind "About this plan". Below it, the full stack of chapters and steps,
  including done ones, opened scrolled to and selecting the next step, ending
  in the badge or a completion milestone. A badge inside another plan shows as
  one card with its progress that opens the badge's own plan.
- **Moving between plans** feels like swiping: the header is a carousel with
  the neighbouring plans peeking at the edges and dots below. On mobile it is a
  swipe; on desktop the peeks and dots are clickable.
- **Profile/portfolio**: earned badges with portable Open Badges awards,
  recorded certifications and milestones. There is no "My badges": a badge
  being earned is a plan in My plans, and earned badges are the portfolio's
  Badges tab. The learner nav is Hub, My plans, Discover, Portfolio.

Mockups: https://claude.ai/artifact/56FkTtx8GsDWgGUtbYMssB

## What it costs

- **Plan composition**: an objective that references a route instance shared
  across parent plans.
- **Push-to-active-plans** for template edits (above).
- **Credential model** on top of requirement frameworks; issuer authorization
  and learner links rescoped from badge to credential (+ route).
- **Migration**: each badge version's learning path → a plan template with
  Activity objectives (same activities, so runs stay attached); badge criteria
  → a requirement framework with nodes mapped from the path; awards stay
  attached to the credential. Badge catalog/marketplace pages become the
  credential pages and catalog.
- **Connector**: activity tools exist; route editing reuses the plan template
  document; credential criteria reuse requirement framework tools plus a small
  route-approval tool.

## Kinds of credential

All are the same model (requirements + routes + award); they differ in issuer
and availability.

- **Credential**: issued here by an issuer org, with an Open Badges award.
- **External certification** (OSHA 10, CPR, …): issued outside the app. We
  record it rather than issue it. Its route is a Create objective (upload the
  card/certificate, with expiry date) that a counselor verifies; an optional
  prep-plan route leads up to it. It can map to school requirements like
  anything else. No Open Badges award from us.
- **Challenge**: a credential with an availability window, published on a
  cadence (e.g. monthly), one short open route, one badge per edition
  ("October 2026 challenge").
- **Milestone**: what personal and school plans give for finishing chapters or
  the plan (the reward moments in the youth prototype). Lightweight, shown in
  the profile, no issuer, no Open Badges, so credentials stay meaningful. A
  school that wants something weightier (e.g. a capstone) creates a credential
  and makes its plan a route.

## Decisions (defaults until something says otherwise)

1. **Sign-off is per objective.** Issuers sign off objectives; the signed-off
   objective is the evidence attached to the requirement nodes it maps to.
2. **Push rules**: a content edit is any change that keeps the objective's type;
   changing the type is a remove + add. Learners get one notification per push
   ("your plan was updated") listing what changed.
3. **Migration of in-progress badge runs**: runs stay attached to their
   activity; the learner's route instance is created from the version they
   started; credit for already completed activities is written to the mapped
   nodes.
4. **Node rules**: build criteria from route coverage only; add "N of M" to
   requirement nodes only when a real credential needs it.
5. **Default route**: the creator marks one route as recommended; the
   credential page shows it first, with "Change how you earn it" listing the
   other routes the learner can access.

## Suggested phases

1. Activity as a plan objective type (no badge changes yet); coach-generated
   activities.
2. Push template changes to active plans.
3. Credential model on requirement frameworks; route approval; credential
   objective referencing a shared route instance; route track UI; issuer
   authorization rescoped.
4. Migrate badges to credential + route templates; retire badge-owned learning
   paths and badge assignment; catalog and credential pages; certifications,
   challenges and milestones.

## Related

- `docs/plans/active/plan-ecosystem-refactor.md` (template-owned objectives,
  live plans, requirements)
- `docs/plans/active/claude-activity-connector.md` (Activity Documents, preview,
  connector)
- Youth plans prototype canvas (objective types, chapter flow, reward moments)
