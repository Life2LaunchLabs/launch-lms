# BOT-217 / BOT-219 UI verification

## References

- BOT-217 current-state reference: FEED-5 attachment `10001`, captured from unstable revision `69651b2f9c8df4ad4244c64bd7b3564077f75c8f` at a 1280×551 CSS viewport in dark Chrome. The attachment remains in Jira because it contains learner-owned recent-chat text.
- BOT-219 selected change brief: the owner-authored FEED-4 description, with FEED-3 supplying click-away dismissal.
- Adopted implementation pattern: `apps/web/components/Candidate/CandidateExperience.tsx` in `apps/web/design-system/catalog.json`, plus the adopted Button, Textarea, Badge, Card, and Tooltip primitives.

## Implementation under review

- Branch: `feat/bot-217-219-candidate-polish`
- Surfaces: unstable banner and modal layers, full Hub shell, feedback intent chooser and composer, confirmation, compact history, attachments/comments/unread state, and completed-item actions.
- Browser fixture: synthetic `ui-learner@example.org` against the disposable `launchlms_bot217_verify` database; no personal or shared environment was used.

## Browser evidence

- Chromium, light theme, 1280×551: `apps/web/test-results/ui/candidate-feedback-candida-63bb2-smiss-back-to-their-trigger-chromium-desktop/candidate-feedback-1280x551.png`
- Chromium, light theme, 390×844: `apps/web/test-results/ui/candidate-feedback-candida-63bb2-smiss-back-to-their-trigger-chromium-desktop/candidate-feedback-390x844.png`
- Chromium, dark theme, 390×844 admin shell: `apps/web/test-results/ui/candidate-feedback-candida-63bb2-smiss-back-to-their-trigger-chromium-desktop/candidate-feedback-dark.png`
- Composer with three image-input paths: `apps/web/test-results/ui/candidate-feedback-tester--e1263-eenshot-into-quick-feedback-chromium-desktop/candidate-feedback.png`
- Machine-readable run details: `apps/web/test-results/ui/run-manifest.json` (ignored local evidence).

The focused Playwright matrix exercises Chromium desktop and phone projects. It asserts no document overflow, visual-viewport panel bounds, outside-click and Escape dismissal, focus return, light/dark panel surfaces, compact history, unread comment state, authenticated image thumbnails, removal of ticket/priority details, image paste/upload/drop, send confirmation, Jira-native admin replies, and status movement.

## Findings and fixes

- The full Hub route combined a fixed navigation rail with a non-shrinking 1056px conversation frame. The frame now participates in flex shrinkage, and the workspace clips accidental horizontal paint without hiding focusable content.
- Candidate toolbar and panel widths now use intrinsic-width guards and dynamic viewport units. At 1280×551 and 390×844, `scrollWidth` does not exceed `clientWidth` with the panel open.
- The original overlay sat below Hub content for pointer hit testing. The candidate root, backdrop, and panel now use the shared overlay/modal layers; click-away works and panel focus is trapped and returned to its trigger.
- The feedback panel now follows the FEED-4 hierarchy: no duplicate panel header, compact two-column intent choices, back/send composer actions, short confirmation, one-line activity-sorted cards, thumbnails and comments only on expansion, and resolution actions at the bottom.
- Visual inspection caught a light background leaking into the dark panel. The dark surface is now explicit and covered by a computed-color assertion.

## Checks and remaining review

- `npx tsc --noEmit` — passed.
- Focused ESLint for the changed candidate components and browser spec — passed.
- `bun run build` — passed, including Next.js production compilation and route generation.
- `git diff --check` — passed.
- Focused Playwright candidate suite — 6/6 passed across Chromium desktop and phone before the final dark-surface recapture; the recapture scenario then passed 2/2 across both projects.

Physical software-keyboard behavior is not emulated. Product-owner signoff remains required; suggested review is the two Story owner-test scenario sets at 1280×551, 1280×720, and 390×844 in light and dark themes.
