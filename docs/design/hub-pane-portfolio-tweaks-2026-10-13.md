# Hub pane and portfolio tweaks · 2026-10-13

Owner direction: IDE conversation on 2026-10-13, with Plans/Hub and Portfolio
screenshots supplied in chat (conversation attachments, no local image paths).
This amends the selected learner refresh for these surfaces.

## Design brief

- Desktop: put the icon navigation inside the rounded content pane with 20px
  between navigation and content. The pane fills the space to the resize boundary;
  the normal 1600px navigation/page frame is centered inside this pane.
- Give the content pane a bounded height and its body ownership of vertical scroll.
  Keep navigation sticky and Hub independently scrollable. Owner amendment: no left, top, or bottom edge and no frame when Hub is closed.
  Only the right edge and right corners appear when Hub is open or tucked; retain the phone slide/edge interaction.
- Portfolio: combine section entry points into one full-width column using the
  existing raised navigation bars. Remove duplicate empty featured placeholders
  and the separate Keep building group. Preserve actual featured content, section
  ordering/visibility, bio editing, and owner/visitor permissions.
- Reuse existing design tokens, links, and navigation bars. No new shared component.

## Browser plan and evidence

Required: Plans with long content at 1440×900 and 2264×937, Hub open/closed/edge,
mouse and keyboard resize, sticky navigation, wheel/keyboard scrolling; Portfolio
empty and populated, owner and visitor; 900×900 and 390×844 responsive checks;
dark/light themes and navigation/editor actions.

Real-application rendered comparison is pending: no active local web/API stack or
configured synthetic UI-test environment was available in this session. The
installed Chromium alone does not provide application/fixture access. This report
does not claim a visual pass or release readiness. No Jira task was identified in
this request; the brief and evidence remain in this repository pending task linkage.

Automated verification:

- `./scripts/agent check --changed` was attempted during implementation; its first
  run lacked Bun on PATH. The final all-scope run used installed Node 24 and Bun.
- `./scripts/agent check --all`: documentation, product map, source-size,
  architecture, frontend lint, TypeScript and all 7 frontend test files passed.
  API execution initially stopped at the read-only default UV cache; rerunning
  `uvx ruff check src` and `TESTING=true uv run pytest src/tests -q` with cache
  access passed: 652 passed, 9 skipped, 1 expected failure.
- Removed stale generated `.next-ui-test/types` and `.next-ui-test/dev/types`
  files referencing retired News routes before the final TypeScript pass.
- Scoped `git -c core.whitespace=cr-at-eol diff --check` passed. Existing Windows
  line endings elsewhere in the worktree were preserved.

Existing unrelated
working-tree changes were preserved. No merge, deployment, or owner signoff occurs
as part of these local tweaks.

Scroll region reuses `scrollbar-subtle scrollbar-subtle-rounded`: transparent thumb at rest, visible on hover/focus.
