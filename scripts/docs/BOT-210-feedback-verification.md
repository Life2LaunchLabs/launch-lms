# BOT-210 feedback redesign verification

## Reference and scope

- Story: BOT-210, including owner comments from 2026-09-11 about automatic
  oldest-first announcements and unread badges for all three banner streams.
- Reference: the Story description/comments and the adopted shared components
  and candidate pattern in `apps/web/design-system/catalog.json`. No selected
  page mockup exists.
- Surfaces: learner and admin unstable banner; desktop dropdown panels; phone
  bottom tray; tester feedback history; and Platform > Tester feedback.
- Implementation branch: `feat/bot-210-feedback-banner`.

## Automated evidence

- `npx tsc --noEmit` — passed.
- Focused ESLint over changed web files and the UI specification — passed.
- `npm run test:routing` — 33 passed.
- `TESTING=true UV_CACHE_DIR=/tmp/uv-cache uv run pytest
  src/tests/test_candidate_feedback.py -q` — 10 passed.
- Focused Ruff check over the candidate router, Jira service, and tests —
  passed.
- `git diff --check` — passed.

The API suite covers server-side route/device sanitization, Jira board-column
mapping, team/internal/tester comment visibility, status/shared-reply unread
revisions, oldest-first announcement ordering, merge-note filtering, and the
absence of a feedback-description edit route.

## UI verification hold

The product owner explicitly put browser UI testing and screenshot comparison
on hold on 2026-09-11 because the current workflow is too time-intensive. No
browser pass, screenshots, trace, or visual-match claim is included in this
handoff. This is an owner-directed verification deferral, not a visual pass.

When the stronger UI workflow is restored, verify authenticated tester and
Platform-admin scenarios at 1440x900 and 390x844: banner layout displacement;
announcement auto-open, Next/Done receipts, and full-panel read behavior; all
three unread badges; desktop panel and phone tray placement; immutable feedback
plus follow-up comments; Jira board columns/priorities/transitions; Done dates;
keyboard Escape/focus; and light/dark shell contrast.

## Design-system conformance

The implementation reuses Button, Input, Textarea, Select, Badge, Alert, and
Dialog (for the separate board feedback entry point). The candidate pattern in
the catalog now describes the full-width banner and responsive panels. No new
base primitive or independent token set was introduced.
