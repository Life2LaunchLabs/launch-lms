# UI design references and task readiness

Every UI-affecting task starts here. This is the repository-owned reference index and handoff workflow.

## Reference index

| Scope | Story / durable product context | Location | Authority |
|---|---|---|---|
| Hub companion layouts, awareness and future plan co-creation | BOT-82; PATHWAYS-G006-A001/A002/A004; PATHWAYS-G001-A003 | [Commission and concept drop folder](../../scripts/docs/BOT-82-companion/concepts/README.md), [build plan](../../scripts/docs/BOT-82-companion/build-plan.md) | Brief; no owner-selected concept files registered yet |
| Shared Launch components and tokens | BOT-27; applies across product surfaces | [Catalog](../../apps/web/design-system/catalog.json), [contribution guide](../../apps/web/design-system/README.md) | Adopted component standards; not a page mockup |
| Hub resource carousel and Notes/Reviews | BOT-77/BOT-108 area | [Existing QA record](../../design-qa.md) | Historical evidence index; attachment references are not durable image files. Current rendered comparison remains unverified in that record. |
| Candidate feedback surface | BOT-168/BOT-210 | [Feedback verification](../../scripts/docs/BOT-168-candidate-feedback-verification.md), [interaction verification](../../scripts/docs/BOT-210-feedback-verification.md) | Historical implementation evidence; external-surface replacement must establish new references |

Do not treat an unavailable attachment, an inspiration image or the newest file by date as an approved mockup.
Register supplied files with their existing location now; avoid making divergent copies. If a conversation attachment
is the only copy, preserve the supplied design file in a durable repo location when available, and record provenance.
Do not copy private learner data or credentials into the design library.

## Task pickup: design readiness

1. Read the Story, linked Activity/Step and relevant design-system entries. Search this index, the task's existing
   files and neighboring product references. Identify the current selected version and any later owner direction.
2. Write a short Story note naming the UI surfaces affected, reference paths/versions, layout and interaction changes,
   and the browser scenarios/viewports needed for handoff. If there is no UI impact, simply record that assessment.
3. If references already cover the change, reuse them. For a small fix, a current screenshot plus annotations or a
   precise change description may suffice. For a new layout/flow, create a commission using the template below.
4. Identify specific missing decisions and request them early. Continue independent work. Avoid implementing a
   materially unspecified layout and asking the owner to redesign it after delivery. An explicit instruction to
   proceed with agent-designed UI is valid direction: record assumptions and provide a reviewable prototype.
5. Preserve chosen designs and subsequent amendments in this index. Record who selected them and when; agents do not
   infer owner selection from upload or silently promote their own alternatives.

The check is mandatory; commissioning brand-new art on every task is not. Existing sufficient direction needs no
new approval ceremony. Scale the brief to the change.

## Reusable commission template

Copy to a task-specific folder and fill in only what matters:

- **Task and outcome:** Story, affected Activity/Step, user/role and what the interface must make possible.
- **Current reference:** route, screenshot/file and design-system components to preserve or intentionally change.
- **Concepts required:** composition ID, filename, viewport in CSS pixels, scale, theme, realistic sample content,
  selection/open panels and the specific design decision it resolves.
- **States:** default, empty/loading/error, selected/editing, permission/disabled, confirmation/success/recovery as
  relevant. Separate first-release states from later concepts.
- **Responsive behavior:** desktop and phone; intermediate layout if affected; keyboard/safe area, scroll ownership,
  navigation, overlays and long text. Avoid shrinking a desktop composition to simulate mobile.
- **Interactions:** triggers, transitions, focus, keyboard operation, validation, cancellation and preserved state.
- **Authority and handoff:** inspiration versus selected reference, version, owner amendments, required versus
  exploratory elements, drop folder and minimal selected set before dependent implementation.
- **Verification:** reproducible scenario, fixture role/data, target viewport/theme and what counts as a material
  mismatch. Identify visual regions and interaction assertions; do not rely on a vague resemblance score.

## Before UI handoff

Capture the current implementation at the referenced state and viewport, then inspect the reference and capture.
Compare hierarchy, spacing, typography, wrapping, color, images, copy, controls and responsive behavior. Exercise the
primary actions, keyboard/focus and error paths. Fix material differences, recapture affected states, and link a
task-specific report from the Story.

Report the reference version, implementation revision, scenario/role, viewport/theme/browser, capture and trace paths,
commands/results, visual findings, fixes, remaining limitations and explicit owner-accepted deviations. Never overwrite
the root `design-qa.md` as a shared scratchpad. Missing access or data is a concrete blocker, not a pass. Automated
checks do not replace owner signoff.
