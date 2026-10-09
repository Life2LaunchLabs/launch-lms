# Quality contract

`./scripts/agent check --changed` provides fast task feedback. `--all` runs the
repository documentation/product checks plus frontend lint, type, and unit checks
and API lint/tests. CI remains authoritative for browser and multi-architecture
image verification.

Quality gates must fail truthfully. Do not append `|| true`, weaken a rule, update
a baseline, or accept a screenshot merely to make work pass. Existing large files
are recorded in `source-size-baseline.json`; new production source files may not
exceed 500 lines, and existing over-limit files may not grow without a documented
exception in this directory.

`architecture-baseline.json` similarly ratchets API router/data direction,
frontend service/UI direction, direct external requests from components,
unstructured diagnostic output, and direct component-library adoption. A baseline
is visible debt, not permission to copy the pattern. Reduce its count when a
violation is removed; explain any deliberate exception in a reviewed plan.

The frontend's historical ESLint findings are enumerated by file, rule, and
severity in `frontend-lint-baseline.json`. `bun run lint` fails on every new finding
or increase and asks for resolved entries to be deleted. Use `bun run lint:raw` to
inspect the complete legacy output. The baseline makes debt explicit; it does not
turn an ESLint failure into an unreported success.
