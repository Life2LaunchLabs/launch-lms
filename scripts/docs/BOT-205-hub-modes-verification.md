# BOT-205 Hub mode selector verification

Verified 17 September 2026 against the optimized Next.js application artifact.

## Reference and implementation

- Product direction: BOT-205 and `PATHWAYS-G006-A001`, `PATHWAYS-G006-A004`, and `RESOURCES-G001-A002`.
- Visual reference: the Hub composer and transcript at base revision `4bcc726e8da1e851645f4dac114d9998b56fcd78`, preserving the adopted Button and Textarea treatments while adding the specified compact three-way control.
- Implementation under test: base revision above plus dirty-worktree fingerprint `d967edb126b8d3f2baccf5838d37e287af0b7d11c5659a4dbe8e5b22072b8300`; the delivery commit is recorded in the BOT-205 workpad.
- Fixture: synthetic UI learner in the dedicated local UI-test database; no shared or production learner data.
- Browser and viewports: Playwright Chromium desktop at 1440×900 and Pixel 7 emulation at 390×844, light theme.

## Evidence

`UI_TEST_WEB_MODE=start bash scripts/ui/run-local.sh apps/web/tests/ui/hub-modes.spec.ts --project=chromium-desktop --project=chromium-phone`
passed 4/4 against the optimized build. The ignored run manifest is at
`apps/web/test-results/ui/run-manifest.json`; captures are the `hub-chat-search-work.png` files in the matching desktop
and phone scenario directories under `apps/web/test-results/ui/`.

The scenario verifies Chat default and ordinary guidance, native radio keyboard movement, attachment-library access,
question-like explicit Search rendering the existing inline results object, Work producing the existing unconfirmed
focused-session action without entering an editor, next-turn reset to Chat, persisted Chat/Search/Work receipts after
reload, Stop recovery, and retained Work selection after cancellation. It also asserts that the newest focused action
does not intersect the composer after phone reload.

Supporting checks completed on the same source include 29 focused API tests, 6 Hub interaction tests, Ruff, product-map
validation, source-size and architecture policies, TypeScript, and the optimized Next.js build. `./scripts/agent
check --changed` reaches and passes all frontend checks but cannot invoke its API suite on this runner because only
Python 3.14.0rc3 is installed while the project requires 3.14.3; the same suite runs through the existing
`apps/api/.venv/bin/pytest` environment.

## Findings and fixes

- The selector remains visually subordinate to the input and uses native radio semantics; Chat, Search, and Work fit
  between attachment and Send/Stop without wrapping at either viewport.
- Each new user turn has a small mode receipt. Historical messages remain unbadged because the pre-BOT-205 database
  default cannot distinguish inferred Search from Chat.
- Explicit Search uses the existing inline response layout and permission-filtered resource request. The synthetic
  query produced the reviewed zero-result state without advisor prose.
- Work returned a code-owned “Work on this plan” action and did not navigate or open the focused editor before learner
  activation.
- Initial phone verification found the newest Work action partly beneath the fixed composer after reload. Mobile-only
  scroll clearance matching the bottom-navigation offset fixed the overlap; the final capture and bounding-box
  assertion pass.
- Attachment, Send, Stop, selected and default states retain the established Hub visual language. No material or
  owner-accepted deviation remains.

## Remaining verification

Owner product signoff and the required PR checks remain pending. Mobile WebKit is covered by the repository browser
lane rather than this local Chromium evidence run.
