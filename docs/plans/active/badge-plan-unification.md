# Badges and plans: one engine (proposal, not started)

Status: proposal for a future session. Nothing here is built. Pick up from
"Decisions to make first".

## Problem

Badges and plans have grown into two parallel ways of guiding a learner
through steps:

- A **badge** owns a learning path (`LearningBadge` → `LearningBadgeVersion` →
  `LearningPath` → `LearningActivity` → `LearningPage`), with interactive
  activities (blocks, questions, branching flow, learner variables), runs
  (`LearningRun`, `LearningActivityRun`, `LearningPageProgress`), reviewers,
  issuers (`BadgeIssuerAuthorization`) and Open Badges awards
  (`LearningBadgeAward`).
- A **plan** (template → live `Plan`) owns phases and objectives of any kind,
  collaborators, schedules and requirement links.

When a counselor puts a badge in a plan, each badge activity can surface as its
own plan objective, mirroring the badge page closely enough to confuse
learners ("am I in my plan or in the badge?"). Meanwhile the interactive
activity is useful well outside badges (e.g. the coach generating a short
interactive to learn about the student), and badge creators can't mix
activities with other kinds of steps (uploads, events, real-world actions).
There are also two assignment ideas (badge vs. plan).

`LearningRun` already carries `plan_id` / `plan_objective_id`, so badge runs
are partly linked to plans today.

## Proposal

Unify the building blocks; keep the credential as its own thing.

1. **Activity is a standalone building block.** The interactive activity
   (Activity Document: pages, blocks, flow, outcomes) no longer has to live
   under a badge path. A plan objective of type **Activity** references one.
   The coach can generate activities with the existing Activity Document
   format, validator, preview player and connector tools. Answers keep flowing
   into learner variables.
2. **A badge's learning path becomes a plan template ("pathway").** Badge
   creators build it in the plan editor and can mix activities with other
   objective types (Create, Event, Action, …). Starting a badge = starting its
   pathway, which removes the separate badge-assignment idea.
3. **The credential stays separate and is earned by completing a pathway.**
   A credential carries what plans don't: an issuer, published and versioned
   criteria, reviewers, and portable Open Badges awards. It points at a
   published pathway version ("completing this earns me"), optionally naming
   which objectives need reviewer sign-off.
4. **Plans reference pathways; they don't copy them.** Putting a credential
   in someone's plan adds one objective ("Earn the Workplace Communication
   credential") that shows the pathway's progress and opens into the pathway as
   its own track (like the school track). Progress lives once, so the same
   pathway referenced from a counselor plan and a school plan is completed once
   and satisfies both. The issuer owns the pathway's steps; the learner can't
   edit them but can build their own chapters around them.

### Objective types this assumes (agreed in design review)

Event (scheduled; includes scheduled conversations) · Action (real-world, check
off; includes unscheduled "talk to someone") · Explore (resources) · Activity
(interactive, in-app; authored or coach-generated) · Create (make something
that's yours, in-app or upload; "get feedback", not "hand it in"; feeds the
portfolio) · Decide (a choice and its reasons) · plus the **Credential** card
(a reference to a pathway, not really a type).

## What it costs

- **Plan template versioning.** Credential criteria must be locked, so
  templates gain draft → published versions (badges have this today via
  `LearningBadgeVersion`; plan templates are mutable with a snapshot at
  assignment). School templates benefit from the same states.
- **Plan composition.** An objective that references another plan's progress
  (or a pathway instance shared across parent plans).
- **Migration.** Badge version → pathway template version; path activities →
  Activity objectives referencing the same activities; runs and awards stay
  attached (run → activity stays valid). Learning badge pages
  (catalog, marketplace) become a credentials gallery whose "Start" begins the
  pathway.
- **Issuers and reviewers.** Issuer authorization and reviewer queues move
  from badge-version scope to credential + pathway-version scope.
- **Connector.** Activity tools already exist; pathway editing reuses the plan
  template document; credential criteria need a small new tool.

## Decisions to make first

1. Does a pathway always live as its own track (referenced), or may a plan
   author inline its steps into a chapter (copy) when no credential is
   involved?
2. Major vs. minor pathway versions: which changes force learners onto the new
   version, and which upgrade in place (today's `accept_previous_major_versions`
   logic on badge objectives is the starting point)?
3. Can a learner earn a credential through a different route than its
   pathway (e.g. a counselor attesting equivalent work), and how is that shown
   on the award?
4. Do standalone activities belong to an organization's library, a plan, or
   both (reuse vs. ownership, mirroring the template-owned objective decision)?
5. What the migration does with in-progress badge runs mid-version.

## Suggested phases

1. Activity as an objective type referencing standalone activities (no badge
   changes yet); coach-generated activities behind it.
2. Plan template versioning (draft/published), used first by school templates.
3. Credential model pointing at a pathway version; plan objective that
   references a pathway; pathway track UI.
4. Migrate badges to credential + pathway; retire badge-owned learning paths
   and badge assignment.

## Related

- `docs/plans/active/plan-ecosystem-refactor.md` (template-owned objectives,
  live plans, requirements)
- `docs/plans/active/claude-activity-connector.md` (Activity Documents, preview,
  connector)
- Youth plans prototype canvas (objective types, chapter flow, reward moments)
