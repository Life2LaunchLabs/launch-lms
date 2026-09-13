# BOT-217 viewport review report

## Outcome and reproduction

The authenticated unstable toolbar was stacked above Hub surfaces that independently claimed `100dvh`. On the populated synthetic Hub fixture, the baseline document therefore measured 599px at a 1280×551 viewport, 768px at 1280×720, and 892px at 390×844. Long unbroken announcement and release content also retained intrinsic widths larger than its panel.

The implementation exposes the visible unstable state to the shell, applies a scoped 48px candidate-height variable to the Hub frame, desktop organization navigation, companion workspace, and ordinary organization layout, and allows candidate announcement/release content to wrap inside its existing scroll container. It does not hide content or clip focusable controls.

Owner review:

1. At 1280×551 in Chrome on a populated Hub, open and close Announcements, What's new, and Feedback. Confirm the document has no horizontal scrollbar, the workspace does not shift, long text wraps, and Escape returns focus to the trigger.
2. At 390×844, repeat all three panels and confirm the toolbar, bottom tray, focused controls, and long labels remain inside the visual viewport.

## Revision and checks

- PR: [#72](https://github.com/Life2LaunchLabs/launch-lms/pull/72), targeting `dev`
- Reviewed head: `f826b1acdeb4686e49d040a2530217a144e38e9a`
- CI test merge revision: `30b6ef218e4e899574909ad7a482f5cbbc673aca` (`2909fcc5d38193adfbd834cd649fe49f6ded9fbb` + reviewed head)
- Current `origin/dev` at evidence preparation: `2909fcc5d38193adfbd834cd649fe49f6ded9fbb`; no update or integration was required.
- Successful CI run: [Build Community Images 34772692571](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34772692571)
- Successful web lint run: [Web Lint 34772692443](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34772692443)

Required and browser checks on the reviewed head:

| Check | Result | Evidence |
|---|---|---|
| contract | Passed | [job](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34772692571/job/103765102098) |
| api-lint / ruff | Passed | [job](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34772692571/job/103765102364) |
| api-tests / test | Passed | [job](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34772692571/job/103765102342) |
| migrations / alembic-heads | Passed | [job](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34772692571/job/103765102326) |
| Build and smoke (amd64) | Passed | [job](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34772692571/job/103765123956) |
| Build and smoke (arm64) | Passed | [job](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34772692571/job/103765123982) |
| browser-ui / smoke | Passed | [job](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34772692571/job/103765102295) |
| next-lint | Passed | [job](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34772692443/job/103765055902) |

Local commands:

- `git diff --check` — passed.
- `cd apps/web && bunx tsc --noEmit --pretty false` — passed.
- `cd apps/web && bunx eslint components/Objects/Menus/OrgMenu.tsx` — passed.
- Focused lint across the changed TypeScript files completed with one pre-existing/intended `no-console` warning on the browser test's numeric diagnostic and no errors.
- The isolated API and fixture services started locally, but the constrained runner's Next dev process exited while compiling `/auth/login` before Playwright began. No local browser-pass claim is made; the exact-head CI build and browser run above are the browser authority.

The successful browser run executed the full authenticated suite in Chromium desktop, Chromium phone, and mobile WebKit smoke. BOT-217's Chromium fixture covered two themes × three CSS viewports × four states (closed, Announcements, What's new, Feedback) in each Chromium project. It asserted document width and height, panel bottom and intrinsic scroll width, panel visibility, long content, Escape dismissal, and focus return. All scenarios passed without a retry.

## Visual references and evidence

- Controlling current-state reference: private Jira FEED-5 attachment 10001, revision `69651b2f9c8df4ad4244c64bd7b3564077f75c8f`, dark Chrome at 1280×551. It contains learner-owned text and is intentionally absent from this repository and review upload.
- Adopted references: CandidateExperience toolbar/panel pattern and Hub companion split recorded in `apps/web/design-system/catalog.json`; no new shared component or visual concept was introduced.
- Baseline: synthetic browser run [34770797453](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34770797453), deliberately failing the new regression assertions.
- Final: synthetic browser run [34772692571](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/34772692571), with 48 explicitly opted-in review captures and hashes in its retained `browser-ui-manifest` artifact.

Uploaded comparison files use only synthetic account and conversation data:

| File | CSS viewport / theme / state | Finding |
|---|---|---|
| `evidence/before-dark-1280x551-announcements.png` | 1280×551, dark, Announcements | Baseline full-page image is 1280×599; the workspace extends 48px below the viewport and unbroken content stays on one intrinsic line. |
| `evidence/after-dark-1280x551-announcements.png` | 1280×551, dark, Announcements | Final image is exactly 1280×551; navigation and Hub end inside the viewport and long title/body text wraps within the scrollable panel. |
| `evidence/before-dark-390x844-releases.png` | 390×844, dark, What's new | Baseline full-page image is 390×892 and exposes the displaced lower workspace. |
| `evidence/after-dark-390x844-releases.png` | 390×844, dark, What's new | Final image is exactly 390×844; toolbar and bottom-anchored tray remain bounded while long release text wraps and remains scrollable. |

Manual inspection also covered final light 1280×551 closed, light 1280×720 Feedback, light 390×844 Announcements/Feedback, dark 1280×720 What's new, and dark 390×844 closed captures. Compared with the adopted pattern and private current-state reference, hierarchy, toolbar placement, panel anchoring, colors, typography, controls, and navigation remain consistent. The material differences are limited to corrected shell height and long-text wrapping. No horizontal displacement, clipped focusable control, or replacement design was observed.

## Limitations and deviations

- A physical mobile software keyboard is not emulated by CI. Keyboard focus, Tab containment, Escape dismissal, and focus return are exercised; the owner should include the device keyboard in phone signoff if desired.
- Successful CI does not retain interaction video, so the review upload uses exact before/after PNGs plus automated interaction results.
- Automated and agent visual checks are delivery evidence, not owner product signoff. The PR must not merge until the owner reviews the Jira attachments and moves BOT-217 to `merge`.
