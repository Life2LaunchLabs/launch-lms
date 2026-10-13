# Requirement evidence export

Owner authorization: conversation, 13 October 2026. Build on merged `dev`, create
a delivery branch and merge after checks. Jira configuration is unavailable in
this checkout; the required Symphony workpad remains blocked on credentials.

## Outcome

Teachers and organization administrators can export requirement evidence for the
learners in an assignment or group. Reuse configured objective completion and
approval; do not add a second approval workflow or infer academic course credit.

## Scope and acceptance

- Assignment and group entry points export the currently filtered learners.
- Include framework/enrollment version, official codes and requirement text,
  learner identity, plan/assignment/template context, labeled evidence and links,
  configured staff approval, recorded actor/date, and pending/revision/gap states.
- Preserve multiple evidence contributions and shared evidence across standards.
- Include unmet requirements and learners without a framework enrollment.
- Only export evidence from plans the teacher can review; administrators may
  export their organization's records. Reject unauthorized learner selections.
- Staff attestations remain distinguishable from objective evidence. Confidential
  staff notes are excluded. Protect spreadsheet cells against formula injection.
- Do not infer proficiency, transcript credit, diploma eligibility or waivers.

## Design readiness

Reference: existing assignment/group grids and the owner's supplied long-code
overlap screenshot in the conversation. Preserve these layouts and interactions.
Use the adopted Button; add an Export evidence CSV action beside learner filters,
with visible scope, loading and error feedback. Reuse the adopted Dialog, Input
and Label for optional course name/code, section and term. No new shared design component.
Long codes must remain readable with a separate title area; stack code/title on
phone layouts. Affected surfaces: assignment grid, group requirements grid,
requirement explorer, learner requirement tree. Inspect at 1440x900 and 390x844.
Exercise search-filtered downloads, empty states, keyboard focus, long identifiers,
pending and approved evidence, and server permission failures with synthetic data.

## Verification and recovery

Run focused export/authorization tests, repository changed/all checks, and real
browser downloads with synthetic fixtures. Record captures and findings in a
task-specific verification report. No migration is needed. Revert the delivery
commit to remove the endpoint and controls without altering learner evidence.

## Progress

- Read repository policies, current implementations and relevant PATHWAYS-G005
  product-map outcomes. Started from `origin/dev` at `09bfd69be`.
- Created `feat/sb3-requirement-evidence-export`.
- Owner explicitly authorized a new branch and merge in this conversation.
- Implemented teacher/admin export and assignment, group and learner entry points.
- Added synthetic real-browser fixtures and CI scenarios for downloaded CSVs.
- Local checks passed: nine focused evidence tests, 681 API tests (nine existing
  skips, one expected failure), 61 frontend unit tests, lint/type checks and all
  repository gates. Six desktop/phone browser scenarios passed; captures inspected.
- Existing audit middleware records export actor, organization and HTTP status,
  without logging learner evidence or the selected-user request body.
- Browser inspection caught a clipped phone dialog; constrained its width to the
  viewport and added a dialog-boundary assertion. Verification is recorded in
  [the task report](../../design/requirement-evidence-export-verification.md).

## Export contract

`POST /api/v1/planning/requirements/evidence-export?org_id=...` accepts `user_ids`
(1–1000 selections), optional `assignment_uuid`, `usergroup_id`, `framework_uuid`,
and optional `course_name`, `course_code`, `section`, `term`. It downloads UTF-8
CSV with a BOM and `Cache-Control: no-store`. Filtered UI learners are passed as
explicit IDs; duplicate selections are deduplicated.

One row represents an evidence field/artifact for a learner, enrollment and
requirement. Multiple artifacts produce multiple rows; shared evidence repeats
under each mapped requirement. Empty work, pending review, revision, excused work,
revoked attainment, staff attestations and missing enrollment remain distinguishable.
The report includes both the requirement record and the objective's assessment.
Staff-approved means a completed staff-restricted objective has a dated active
attainment record with an identified actor other than the learner. It does not
assert that one objective demonstrates every aspect of a broad standard.

Course details are exporter-supplied, and the exporting user is identified. They
are context, not verified transcript awards. Review criteria remain the configured
objective's reviewer guidance. A teacher's access is bounded by plan review roles;
an administrator's access is bounded by the organization. General group exports
can include a teacher's own stand-alone attestations; assignment exports for
teachers contain only that assignment's objective evidence. Legacy evidence and
other staff attestations are available to organization administrators. All reports
exclude private staff conversation notes.

Uploaded artifacts and links are referenced, not bundled into the CSV. Existing
access controls and retention still apply when a recipient opens them. Interactive
activity objectives include response attempts, question/page labels, artifact links,
submission and grading dates, scores and recorded graders. Historical attempts are
marked separately from each page's current attempt; automated grades do not become
staff approval. Objectives with no recorded evidence say so explicitly. This release
does not issue academic credit.
