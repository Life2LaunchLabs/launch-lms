# Plan ecosystem refactor (templates, requirements, assignments)

## Objective

Make the plan ecosystem one coherent model, editable from Claude: templates own
disposable objectives, requirement frameworks express that objectives are
equivalent, assignments produce independent live plans, and the connector can
author templates and requirements end to end (assignments come later).

## How it fits together now

```
Plan template (Program)
└── Phase (ProgramPhase)
    └── Objective (Objective via ProgramObjective; owned by this template only)
        └── requirement links (ProgramObjectiveRequirement → RequirementNode)

Assignment batch (ProgramAssignment: target, schedule, staff, frozen snapshot)
└── Live plan per learner (Plan) ── PlanPhase ── PlanObjective (+ its own requirement_mappings)
                                                   └── PlanObjectiveProgress
Requirement framework ── versions ── nodes;  RequirementEnrollment ← credit from completed PlanObjectives
```

## Findings (state before this work)

1. **Two runtime systems.** Assignments wrote both the legacy model
   (`ProgramParticipant` + `ObjectiveProgress` keyed by org/objective/user) and
   live plans (`Plan`, `PlanObjective`, `PlanObjectiveProgress`). The live-plans
   migration had already backfilled every assignment, so legacy progress was a
   compatibility leftover, but matrix, review, progress and learner paths still
   branched on it.
2. **Shared objectives.** An objective row could sit in several templates; a
   completion in one template's plan surfaced in another through the shared
   row and copied progress at materialization. Requirements now express that
   equivalence explicitly; sharing made objectives undeletable and edits leak
   across templates. The web app never offered the reuse picker.
3. **Requirement credit depended on the assignment snapshot**, looked up by the
   shared objective id. Objectives added to a live plan later, or plans not from
   an assignment, could never earn credit.
4. **Duplicate APIs.** `/programs/*` (deprecated) and `/planning/templates/*`
   expose the same template service; learner pages under `/programs/me/*`
   still read participant rows.
5. **Bugs found:** objective reviews failed after commit (`status.value` on a
   reloaded string); the admin user page sent reviews without plan ids, so they
   always hit the legacy branch; assignment schedules wrote ISO strings into
   date columns.

## Done

- **Template-owned objectives** (migration `n1t2o3w4n5e6`): shared objectives
  are split per template; "reuse" copies; template objectives and phases can be
  removed (REST, template documents). Removed objectives are archived so live
  plans keep their provenance.
- **Live plan objectives carry `requirement_mappings`**, copied at
  materialization and backfilled; credit reads them.
- **Legacy runtime removed from assignments:** materialization starts plans
  fresh; legacy matrix, review, batch-progress fallback and learner submission
  paths are gone. The legacy tables stay (no destructive migration yet).
- **The three bugs above are fixed.**
- **Connector** (`plans:read` / `plans:write`): plan templates (documents with
  removal), requirement frameworks (documents with levels, codes, placeholders,
  link-impact warnings; create, save-as-draft, publish), objective ↔ requirement
  linking with coverage, global library search / copy / publish, badge version
  updates.

## Next (recommended, in order)

1. **Learner surfaces onto plans.** The badges-page carousel reads
   `/programs/me/all/details` and the organization page's invitation prompt
   answers participant invitations. Move both to `/planning/feed` and
   `/planning/invitations/*`, then delete `/programs/me/*`.
2. **Retire `ProgramParticipant`.** Group sync (`ensure_group_participants`)
   should materialize plans directly from group membership, and invitations
   should be plan invitations only. Then drop `programparticipant` and
   `objectiveprogress` (and `RequirementAttainmentSource.objective_progress_id`).
3. **One template API.** Delete the deprecated `/programs` template routes and
   rename `Program*` → `PlanTemplate*` in services (tables can keep their names).
4. **Batch objective identity.** Batch operations still find live objectives by
   `source_objective_id`. Pre-split assignments of formerly shared objectives
   resolve to the original row, so a batch update without `plan_uuids` can still
   touch both batches. Scope batch operations by assignment (the web app already
   passes `plan_uuids`) and make `plan_uuids` required.
5. **Requirement links on live plans.** Let staff (and the connector, once
   assignments are in scope) edit `PlanObjective.requirement_mappings`, so
   objectives added to a live plan can earn credit.
6. **Web template editor:** add remove-objective / remove-phase controls now that
   the API supports them.
7. **Assignments in the connector**: preview a template as a learner's plan,
   assign, and manage batches.

## Verification

- `TESTING=true uv run pytest src/tests` (615 passed), ruff, web `tsc`,
  architecture and frontend-lint policy checks.
- PostgreSQL 16: migration upgrade / downgrade / re-upgrade with a shared
  objective and a snapshot-linked live plan (split + backfill confirmed);
  `alembic check` clean.
- Live through OAuth on PostgreSQL: framework create (A, A.1, A.2) → publish →
  link objective → coverage → remove a template objective via document → assign
  → enroll → complete the linked objective → requirement A.1 credited → library
  publish / search / copy → editing the published framework creates v2 draft.
