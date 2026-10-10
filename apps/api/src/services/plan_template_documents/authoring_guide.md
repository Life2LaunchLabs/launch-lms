# Plan template authoring guide

A plan template is a reusable plan: staff assign it to a learner or a cohort,
and each assignment becomes a live plan. A Plan Template Document holds the
whole template.

```json
{
  "format": "launch-lms.plan-template",
  "format_version": 1,
  "template": {"name": "Career Ready", "description": "...", "instructions": "..."},
  "roles": {"definitions": [...], "default_subject_role_key": "subject", "default_staff_role_key": "reviewer"},
  "phases": [
    {
      "phase_uuid": "program_phase_…",
      "name": "Explore",
      "description": "",
      "suggested_duration_weeks": 4,
      "objectives": [
        {
          "objective_uuid": "objective_…",
          "title": "Draft a resume",
          "description": "",
          "allow_learner_confirmation": false,
          "steps": [{"field_uuid": "field_…", "title": "Upload your resume", "type": "media", "allowed_types": ["document"], "restricted": false}],
          "schedule": {"start_rule": "any_time", "due_rule": "phase_end", "allow_late": false, "suggested_due_week": 2},
          "requirement_node_uuids": []
        }
      ]
    }
  ]
}
```

## Phases and objectives

- Phases run in document order; objectives run in order within their phase.
  Move an objective by moving it to another phase's list.
- Keep `phase_uuid`, `objective_uuid` and `field_uuid` on everything that
  already exists. Omit them for new phases, objectives and steps.
- Existing phases and objectives cannot be removed through a document (live
  plans and requirement credit refer to them). Ask the admin to remove them in
  Launch LMS if needed.
- An objective may also be used by other templates in the organization. Edits
  to its title, description and steps apply everywhere it is used; validation
  warns when that is the case.

## Steps

Steps are what the learner (or a reviewer) completes inside an objective.

| type | meaning |
|---|---|
| `text` | Written response |
| `media` | File upload; `allowed_types` from `image`, `video`, `document` |
| `link` | A URL |
| `checkbox` | A confirmation tick |
| `badge` | Earn a badge (`badge_uuid`, optional `accept_previous_major_versions`) |

`restricted: true` means a reviewer fills the step in; otherwise the learner does.
Objectives with no steps are confirmed by staff (or by the learner when
`allow_learner_confirmation` is true).

## Badge objectives

To make an objective that is completed by earning a badge, add it with
`badge_uuid` (find badges with `list_badges`). A badge step is added for you.
The badge of an existing objective cannot change; add a new objective instead.
`badge_major_version` is read-only.

## Schedule

- `start_rule`: `any_time`, `phase_start`, `specific_date`
- `due_rule`: `optional`, `phase_end`, `specific_date`
- `suggested_due_week`: a week within the phase (1..`suggested_duration_weeks`).
  The phase needs `suggested_duration_weeks` set first.
- `specific_date` rules are given concrete dates by staff when they assign the template.

## Roles

Roles decide what each person on a live plan can do. Keys `subject` (the
learner), `plan_admin` and the default staff role must exist; the default staff
role must include `review_badge_submissions`. `plan_admin` always gets every
capability. Capabilities: `view_plan`, `comment`, `contribute_fields`,
`update_progress`, `request_collaborators`, `contribute_restricted_fields`,
`complete_restricted_objectives`, `review_badge_submissions`,
`edit_plan_details`, `edit_structure`, `edit_schedule`, `complete_plan`,
`archive_plan`, `manage_collaborators`, `manage_roles`.
Omit `roles` to leave them unchanged.

## Live plans

Plans already assigned keep the objectives they were assigned with: template
edits apply to future assignments.
