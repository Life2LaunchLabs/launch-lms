# Plans admin rework

Status: built · Mockups: the "Plans admin rework" design canvas

## Why

The admin side for plans, assignments and groups grew piecemeal. The same group plan is
managed in three places, reviews live in four, the old `/admin/programs` tree duplicates
`/admin/plans`, and the top-level noun is "assignment batch", which nobody goes looking
for. Staff also act on learners' assigned plans from the learner app, which mixes the
two sides.

## Shape

**Plans** (sidebar) is for the programme and the daily review work:

| Tab | Route | What it does |
|---|---|---|
| Inbox | `/admin/plans` | Everything waiting on me, grouped by step: reviews, sign-offs to confirm, badge activities to grade, learners who stalled |
| (review) | `/admin/plans/review?assignment=…&objective=…` | One submission after another: queue, evidence viewer (PDF, image, video, text, links), step guidance, feedback, staff-only notes, approve & next |
| Templates | `/admin/plans/templates`, `/admin/plans/{template}/{overview,objectives,assignments,settings}` | Card grid; template overview; Assign is its own action (dialog) |
| Requirements | `/admin/plans/requirements` | Framework tree explorer with coverage by up to two templates; drill to criteria; detail lists the steps that cover each one. Editing stays at `/admin/plans/requirements/{framework}/{details,levels,spec}` |

**Users** keeps people and groups. Their pages gain the plan views:

| Page | Tabs |
|---|---|
| Group `/admin/users/groups/{id}/{subpage}` | Plans (the group grid: chapters as column groups, bulk mark done / excuse, review cells open the review screen) · Requirements · Members · Settings |
| User `/admin/users/user/{username}/{subpage}` | Overview (requirement gaps with make-up or credit, plans, details, badges) · Plans · Requirements |

**Learner app**: plans are the learner's. Staff no longer manage assigned plans from
`/plans`; the "Helping" feed only shows plans someone shared with you (not plans you are
staff on through an org assignment), and the group workspace route is removed.

## Removed or redirected

- `/admin/programs/*` → `/admin/plans/*`
- `/admin/plans/assignments` (list) → Inbox; `/admin/plans/assignments/{uuid}/…` → the group's Plans tab (or the learner page for an individual assignment)
- `/admin/plans/reporting` → Requirements
- `/admin/users/groups/{id}/programs/…`, `/admin/users/cohorts/…` → group Plans tab
- `/plans/groups/{assignment}` (learner app) → `/plans`
- The "How managed plans work" explainer banner

## Backend

Routes live in `routers/plan_admin.py`; services in `services/plan_admin.py` (inbox, review)
and `services/plan_learners.py` (learner requirements, make-ups, credit, coverage).

- `GET /planning/inbox?org_id` — grouped work for the current staff member.
- `GET /planning/inbox/queue?org_id&assignment_uuid&objective_uuid` — the review queue for one group of submissions, with step definitions, values and staff notes.
- `POST /planning/inbox/confirm?org_id` — confirm many submissions at once (sign-offs).
- `POST /planning/inbox/decide?org_id` — approve one submission, or send it back with feedback.
- `POST /planning/inbox/staff-notes?org_id` — staff-only notes on a learner's step; never returned to learners.
- `GET /planning/requirements/{framework}/coverage?org_id` — node tree with the template steps mapped to each node.
- `GET /planning/managed-users/{user_id}/requirements?org_id` — a learner's requirement status per framework, with gaps and the steps in their plans that could still meet them.
- `POST /planning/managed-users/{user_id}/requirements/credit?org_id` — staff attestation for one requirement, with a note.
- `GET /planning/managed-users/{user_id}/makeup-options?org_id&node_uuid` and `POST …/makeup` — add a step to one learner's plan that counts toward the gap it fills (a copy of a template step that meets the requirement, or a named one).
- Group grid "Excuse" uses the existing batch progress endpoint with status `canceled`.
- Staff no longer see plans handed out by an organization in their own plans list or feed (`planning._learner_side`); the admin Inbox and pages are where that work happens.
- `GET /planning/groups/{usergroup_id}/requirements?org_id&framework_uuid` — the group Requirements tab: learners by requirement (met, planned, gap) for one framework, columns grouped by top-level category. Staff who are not org admins see only the learners whose plans they review.
- `DELETE /planning/plans/{plan}/invitations/{invitation}` (`routers/plan_sharing.py`) — take back an unanswered invitation; it also leaves the recipient's inbox. Inviting someone who already has a waiting invitation is a 409.
- Learner app: the plan panel's "Shared with" section opens a share dialog (`PlanShareDialog.tsx`) to invite by email, change access, take back invitations, remove people, or leave.
- Migration: `objective.reviewer_guidance`, `planobjective.reviewer_guidance`, `planobjectiveprogress.staff_notes`.

## Not in this pass

- Records carried over from another school. Requirement credit is held per school (each school's framework, enrollment and attainment rows), so a new school starts from zero. The learner keeps access to their old school plans and evidence, but the school owns those plans, so sharing one with a new counselor goes through the old school's approval; personal plans they can share freely. Carrying credit across needs a way to match one school's requirements to another's, which is a separate design.
- The badge/plan unification (see `badge-plan-unification.md`).
