# Framework editor and learner flow corrections

Owner authorized implementation and branch/merge delivery in the 2026-10-13
conversation, with these follow-up amendments:

- Imported frameworks with supplied codes and no predefined levels must expose
  their existing hierarchy in Spec. Editing must preserve codes, IDs, parents,
  metadata and source references; publishing uses saved nodes. Levels explains
  the free-form structure. Converting to generated codes requires an explicit
  confirmation. Never publish the owner's actual Oregon draft as a test.
- Plan invitation cards identify the inviting organization. Personal invitations
  use the inviter's name; collaborator role remains visible.
- Learner activity routes occupy the viewport without navigation, Coach or page
  chrome. Exiting restores the learner shell and existing Coach session.
- Submitted objectives look finished with “Waiting on review”; they are excluded
  from the next actionable step. Approval, dependency and completion counts retain
  their existing meaning. Changes requested returns a step to the active path.

Design readiness: reuse the adopted Plan path and Coach shell in
`apps/web/design-system/catalog.json`, existing requirement editor controls and
the learner refresh references in `docs/design/README.md`. The owner's supplied
pending-review screenshot is current-state evidence: replace the active star and
Continue emphasis with a finished node, waiting line and secondary review action.
No new shared components or visual direction are needed.

Browser plan: synthetic fixtures, Chromium desktop 1440×900 and phone 390×844.
Exercise free-form save/publish round trip, generated-level authoring, invitation
organization/personal fallback, next-step selection, submitted review, requested
changes, focused activity entry/exit and restored Coach. Capture and inspect the
actual rendered states; record commands, revision and captures in a task report.

No Jira task/session is configured for this interactive request. This plan and
the delivery PR retain scope, decisions and evidence. Checks and visual evidence
passed: 683 API tests, 63 frontend unit tests and eight browser scenarios across desktop/phone. Ten synthetic captures were inspected; the [verification report](../../design/framework-editor-and-learner-flow-verification.md) records the exact revision and findings. PR #124 targets dev; latest-head CI, protected merge and deployment observation remain underway.
