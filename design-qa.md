**Source visual truth**

- `/home/henry/.codex/generated_images/01a015f9-9b52-7e40-be9a-6a8a21a27ce7/exec-41d7269b-d3e7-451d-88b6-311de01b4d9b.png`
- Source pixels: 1584 × 992.
- Intended desktop viewport: 1584 × 992 CSS px at device scale factor 1.
- State: cohort/program matrix with a focused learner row, focused objective column, selected learners, bulk action bar, and completion panel open.

**Implementation evidence**

- Primary implementation: `apps/web/components/Admin/Programs/CohortProgramAdmin.tsx`.
- Route: `/orgs/[orgslug]/admin/users/cohorts/[cohortid]/programs/[assignmentuuid]`.
- Production build: passed.
- Browser-rendered implementation screenshot: not yet captured.
- Primary interactions implemented: program switching, cohort filters, row focus, column focus, cell focus, eligible learner selection, in-person batch completion, single completion, staff notes, and completion date.
- Console errors checked: blocked until browser authorization is available.

**Findings**

- [P1] Browser comparison is not yet available.
  Location: full cohort/program matrix.
  Evidence: the source image is available, but no browser-rendered implementation screenshot has been captured at the same viewport and state.
  Impact: typography, density, sticky table behavior, overflow, and modal proportions cannot be signed off visually from source code or build output alone.
  Fix: open the local product in the user-approved browser, seed or select a cohort rollout, reproduce the selected row/column and completion-panel state, capture at 1584 × 992, and compare both images together.

**Required fidelity surfaces**

- Fonts and typography: implemented with the product's existing font stack and weight conventions; visual comparison pending.
- Spacing and layout rhythm: follows existing admin cards, headers, shadows, radii, and table density; visual comparison pending.
- Colors and visual tokens: uses the existing warm gray, white, black, blue, green, and amber UI tokens; visual comparison pending.
- Image quality and asset fidelity: the matrix uses the existing avatar/image behavior and library icons; no placeholder illustrations or custom SVG/CSS art were introduced.
- Copy and content: matches the approved teacher workflow and completion terminology.

**Comparison history**

- Pass 1: blocked before visual comparison because no user-approved browser capture is available. No visual fixes were made from an unsupported code-only comparison.

**Implementation checklist**

- Capture the implementation at the source viewport and state.
- Test program switching, filters, row/column lift, single completion, and batch completion.
- Check the browser console.
- Compare source and implementation together and fix all P0/P1/P2 drift.

**Follow-up polish**

- None classified until the first browser comparison is complete.

final result: blocked
