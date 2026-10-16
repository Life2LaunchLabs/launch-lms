# Plan template authoring guide (goal templates, format version 1)

A plan template is a reusable goal: staff assign it to a learner or a group,
a badge can hand it out, and each one issued becomes the learner's own goal.
The whole template is one Goal Template Document: stages, and in each stage an
ordered list of typed steps.

```json
{
  "format": "launch-lms.goal-template",
  "format_version": 1,
  "template": {"title": "Career Ready", "description": "...", "instructions": "...", "step_order": "any"},
  "roles": {"definitions": [...], "subject_role_key": "subject", "staff_role_key": "reviewer"},
  "stages": [
    {
      "key": "stage_…",
      "title": "Explore",
      "description": "",
      "timing": "First month",
      "duration_weeks": 4,
      "steps": [
        {
          "key": "step_…",
          "type": "upload",
          "title": "Draft a resume",
          "description": "",
          "config": {"slots": [{"key": "resume", "label": "Your resume", "kinds": ["document"]}]},
          "materials": [],
          "completed_by": "learner",
          "review_required": true,
          "reviewer_guidance": "Check it fits on one page.",
          "after": [],
          "due_week": 2,
          "allow_late": false,
          "requirement_node_uuids": []
        }
      ]
    }
  ]
}
```

## Stages and steps

- Stages run in document order; steps run in order within their stage. Move a
  step by moving it to another stage's list.
- Keep `key` on every stage and step that already exists; omit it for new ones
  and the server assigns one. Keys are how versions, issued goals, requirement
  links and `after` refer to steps.
- Leaving a stage or step out removes it from the draft. Goals already issued
  keep their copy. Validation lists removals as warnings; confirm them with the
  admin before saving.
- `timing` is a rough label shown when there are no dates ("First month").
  `duration_weeks` lets steps set a `due_week` within the stage.

## Step types

Every step has exactly one `type`, and `config` holds that type's settings.

| type | config | the learner | done when |
|---|---|---|---|
| `task` | optional `list`: `{label, target, item_kind: "text"\|"link"}` | ticks it, or adds list items | ticked, or the list reaches `target` |
| `upload` | `slots`: `[{key, label, kinds: ["image","video","document","link"]}]` | adds one file per slot | every slot is filled |
| `write` | `prompt`, optional `max_words` | writes a text answer | handed in |
| `activity` | `activity_uuid` (set by the server) | plays an interactive activity | the run finishes (and is graded, if it needs grading) |
| `event` | `date`, `start_time`, `end_time`, `place`, `url`, `rsvp`, `reflection_prompt` | RSVPs, optionally reflects | attended |
| `badge` | `badge_uuid`, `accept_previous_major_versions` | earns the badge | the badge is awarded |
| `portfolio` | `check`: `welcome`, `timeline`, `project`, `traits`, `launch` or `badges` | completes a portfolio section | the section is complete |
| `decision` | `question`, `options`: `[{key, label}]`, `multiple`, `allow_other` | chooses, with a reason | a choice is saved |
| `routine` | `target` (times a week), `entry_kind` (`named` or `count`), `item_label`, `end_date`, `end_after`, `follow_up`: `{after_days, statuses}` | logs each one; sets follow-up outcomes | the learner ends it, or its end date, its stage's end or `end_after` comes first |

Unknown config keys are errors. Activity, badge and portfolio steps finish on
their own, so they are always `completed_by: "learner"`.

## Who completes a step

- `completed_by: "learner"` (default): the learner finishes it.
- `completed_by: "staff"`: staff mark it done (an interview, a meeting).
- `review_required: true` (learner steps only): the learner submits, and staff
  approve it before it counts. Staff steps are never reviewed.
- `reviewer_guidance` tells staff what to look for, one point per line.
  Learners never see it.

## Materials

`materials` are things to read or watch on the step:
`{"kind": "link", "title": "...", "url": "https://..."}` or
`{"kind": "resource", "resource_uuid": "...", "title": "..."}`.

## Activity steps

Add one by giving a new step `"type": "activity"` with no `config` and saving.
The saved document shows `config.activity_uuid`; write its pages with the
activity tools (`get_activity`, `get_activity_schema`, `validate_activity`,
`preview_activity`, `save_activity`). Activity edits change the draft and
reach learners when the template is published.

## Badge steps

Find badges with `list_badges`, then add a step `{"type": "badge", "config":
{"badge_uuid": "badge_…"}}`. `update_template_badge_versions` decides whether
awards of earlier major versions still count.

## When steps open

`template.step_order` is copied onto every goal issued from the template:

- `any`: every step can be started any time.
- `in_order`: each step opens when the one before it is finished.
- `by_stage`: each stage opens when the stage before it is finished.

A step's `after` lists keys of steps that must be finished first. A step
waiting on review counts as finished for opening what follows.

## Requirements

`requirement_node_uuids` links a step to leaf requirement nodes (see
`list_requirement_frameworks`); finishing the step credits them. Link steps in
different templates to the same nodes to say they achieve the same thing.
`set_objective_requirements` changes one step's links (pass `step_key`).

## Roles

Roles decide what each person on an issued goal can do. Keys `subject` (the
learner), `plan_admin` and the staff role must exist. Capabilities:
`view_plan`, `comment`, `contribute_fields`, `update_progress`,
`request_collaborators`, `contribute_restricted_fields`,
`complete_restricted_objectives`, `review_badge_submissions`,
`edit_plan_details`, `edit_structure`, `edit_schedule`, `complete_plan`,
`archive_plan`, `manage_collaborators`, `manage_roles`.
Omit `roles` to use the defaults.

## Versions

Saving edits the draft. `publish_plan_template` (only when the admin asks)
makes it the version new assignments and badge starts get. Goals already
issued keep their version and their learners' answers.
