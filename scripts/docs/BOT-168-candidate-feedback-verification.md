# BOT-168 candidate feedback design verification

## Reference and scope

- Story: BOT-168, local In Progress snapshot updated 2026-09-10.
- Reference: the Story design-readiness note and the adopted primitives in
  `apps/web/design-system/catalog.json`; no selected mockup existed.
- Surfaces: authenticated candidate toolbar, Feedback / What's new / About
  dialog, and organization-admin tester-feedback queue.
- Implementation base: `50fd1853d` plus the BOT-168 working-tree changes.

## Browser verification

Playwright exercised an authenticated tester and organization administrator in
Chromium at desktop and phone viewports. Candidate API responses were mocked so
the run did not create real Jira issues or depend on GitHub availability. The
normal local login and application shells were real.

Command:

```bash
UI_TEST_CAPTURE=true LAUNCHLMS_RELEASE_CHANNEL=unstable \
  bash scripts/ui/run-local.sh tests/ui/candidate-feedback.spec.ts \
  --project=chromium-desktop --project=chromium-phone
```

Result: 4 passed. The tester run covered the unread indicator, unseen/earlier
release grouping, clipboard paste, file picker, drag/drop, history, and the
absence of staff-only notes. The admin run covered the outstanding queue,
public/internal message distinction, priority/status controls, and associating
a proposed fix with the current push for tester confirmation.

Captured evidence (generated locally under the ignored test-results folder):

- `apps/web/test-results/ui/candidate-feedback-tester--e1263-eenshot-into-quick-feedback-chromium-desktop/candidate-whats-new.png`
- `apps/web/test-results/ui/candidate-feedback-tester--e1263-eenshot-into-quick-feedback-chromium-desktop/candidate-feedback.png`
- `apps/web/test-results/ui/candidate-feedback-tester--e1263-eenshot-into-quick-feedback-chromium-phone/candidate-whats-new.png`
- `apps/web/test-results/ui/candidate-feedback-tester--e1263-eenshot-into-quick-feedback-chromium-phone/candidate-feedback.png`
- `apps/web/test-results/ui/candidate-feedback-admin-c-d3645-prepare-tester-confirmation-chromium-desktop/candidate-admin-triage.png`
- `apps/web/test-results/ui/candidate-feedback-admin-c-d3645-prepare-tester-confirmation-chromium-phone/candidate-admin-triage.png`

## Findings

- The toolbar remains readable without competing with the Hub composer or
  mobile navigation, and is mounted outside the Hub frame so full-screen Hub
  cannot hide it.
- Quick text entry remains the primary action. Screenshot affordances are
  secondary and clearly describe the three supported input paths and limit.
- New release notes are visibly separated from earlier updates; the toolbar
  unread dot clears when the feed acknowledgement succeeds.
- Public replies and internal notes are visually distinct in admin. The tester
  API and browser check exclude internal notes.
- The phone dialog uses the available viewport and scrolls its content without
  covering the fixed bottom navigation. The admin queue stacks list/detail and
  keeps its actions large enough for touch use.
- No material divergence from the scoped change brief remains. Owner product
  signoff and a live Jira/GitHub integration check are still required.

## Design-system conformance

The implementation reuses Dialog, Tabs, Textarea, Button, Badge, and Alert.
`CandidateExperience` is recorded as an adopted product pattern in the catalog,
which is rendered by the native `/design-system` preview. No replacement base
primitive or independent token set was introduced.
