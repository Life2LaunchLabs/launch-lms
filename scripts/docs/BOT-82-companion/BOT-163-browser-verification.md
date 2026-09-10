# BOT-163 browser verification

Verified 10 September 2026 against the optimized Next.js application artifact.

## Reference and build

- Product direction: `build-plan.md`, BOT-163 owner scenarios, and the owner-reviewed BOT-156 companion shell.
- Component standard: `apps/web/design-system/catalog.json` Button and Dialog patterns.
- Source revision: `d8a22074890536b64cc72533ac39e23a1e378327`; the exact dirty-worktree fingerprint is recorded by the ignored run manifest alongside each capture set.
- Fixture: synthetic `ui-learner@example.org` in isolated `launchlms_bot148_ui`; no shared or production data.
- Browser/viewports: Playwright Chromium 149, 1440×900 desktop and 390×844 phone, light theme.

## Executed evidence

`UI_TEST_WEB_MODE=start ... bash scripts/ui/run-local.sh --project=chromium-desktop --project=chromium-phone`
passed 10/10 after normal-login preflight. Scenarios cover Start a plan by keyboard, Add to Timeline, click-time
rejection with an in-context alert, retained conversation text in the mounted companion after each handoff, Plans modal
interaction, and phone composer usability. The run manifest is at
`apps/web/test-results/ui/run-manifest.json`; captures are under the matching ignored `apps/web/test-results/ui/`
scenario directories for `hub-create-plan-action.png`, `hub-add-timeline-action.png`, and `plans-create-editor.png`.

Supporting checks: 25 focused Hub API tests, Ruff, TypeScript, focused ESLint, 33 routing tests, one Alembic head,
optimized Next build, CI contract tests, and `git diff --check` passed. Direct whole-file ESLint on
`PortfolioShell.tsx` still reports its pre-existing unused-code and effect-state findings; the new query-consumption
effect type-checks and the focused changed-surface lint set is otherwise clean.

## Visual findings and fixes

- Assistant prose remains primary and the compact verb-first action row follows it without turning prose into links.
- Both desktop actions align with the transcript column and remain visually subordinate to the advice.
- At 390px the initial composer overlapped the fixed bottom navigation. The composer was moved above that navigation;
  the recapture shows the complete input and send control with clear separation.
- Start a plan opens the native Plans dialog and focuses Goal. Add to Timeline opens the native Work & Career editor.
  Both one-time trigger query parameters are removed after consumption so reload does not reopen the editor.
- A server rejection leaves the learner in Hub and exposes the reason through an alert. No automatic navigation was
  observed before activation.
- No material deviation from the specified post-response action treatment remains. Owner product signoff is pending.

## Remaining environment limitation

The pinned WebKit 26.5 browser downloaded locally, but this workstation lacks its GTK/GStreamer runtime libraries and
cannot install them without interactive sudo. Local WebKit is therefore not claimed as passed. The new CI lane uses
`playwright install --with-deps` and includes the mobile WebKit smoke; its first remote run remains required evidence for
BOT-151/BOT-148. This does not invalidate the completed BOT-163 desktop and 390px Chromium owner scenarios.
