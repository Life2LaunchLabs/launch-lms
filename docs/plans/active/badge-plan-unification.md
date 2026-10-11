# Badges and plans: one engine (proposal, not started)

Status: proposal for a future session. Nothing here is built. Direction agreed
in design review; pick up from "Suggested phases".

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
   their own objectives around it.
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

Badges stop being a primary destination. Credentials show up as what plans
earn:

- **Catalog ("things to work on")**: templates and credentials together; cards
  show what they earn, rough effort, and whether you can start now / request /
  need an invite.
- **Credential page**: what it is, creator and issuers, requirements, and the
  ways to earn it you can access, side by side.
- **Challenges**: the current challenge is featured at the top of Discover.
- **Inside a plan**: the credential card shows route progress; the coach can
  suggest credentials that fit the plan.
- **Requirement views**: school requirements can list the credentials and
  plans that satisfy them.
- **Profile**: earned credentials with portable Open Badges awards (the value
  of today's badge pages ends up here), recorded certifications and milestones.

"Badge" can stay the learner-facing word for the earned item.

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

Mockups of the learner side (Discover and credential detail):
https://claude.ai/artifact/56FkTtx8GsDWgGUtbYMssB

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
