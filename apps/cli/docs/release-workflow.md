# CLI Local Build Workflow

How to update and verify the repository-local Launch LMS CLI.

## Prerequisites

- Node.js 18+
- Push access to the repository

## Steps

### 1. Bump the version

From the CLI directory:

```bash
cd apps/cli
```

Pick the bump type based on the changes:

| Command | When to use | Example |
|---------|-------------|---------|
| `bun run version:patch` | Bug fixes, small tweaks | 0.1.0 → 0.1.1 |
| `bun run version:minor` | New features, non-breaking | 0.1.0 → 0.2.0 |
| `bun run version:major` | Breaking changes | 0.1.0 → 1.0.0 |

This updates **both** `package.json` and `src/constants.ts` to keep them in sync.

### 2. Commit the version bump

```bash
git add apps/cli/package.json apps/cli/src/constants.ts
git commit -m "chore: bump cli to 0.2.0"
```

### 3. Build the local CLI bundle

```bash
cd apps/cli
npm run build
```

### 4. Verify from the repo root

```bash
cd ../..
./launch-lms --version
./launch-lms doctor
```

The repo-root launcher is the supported execution path for this repository.

## How it works

### Version lives in two places

| File | Field | Why |
|------|-------|-----|
| `package.json` | `"version"` | tracks the CLI bundle version |
| `src/constants.ts` | `VERSION` | CLI displays this at runtime (banner, `--version`) |

The `scripts/bump-version.js` script updates both at once so they never drift.

### Safety checks

- The repo-root `./launch-lms` wrapper rebuilds the bundle automatically when the CLI source is newer than `dist/`.
- Manual `npm run build` is still useful before commits that change CLI behavior.

## Quick reference

```bash
# Full local update flow (example: releasing 0.2.0)
cd apps/cli
bun run version:minor                                    # 0.1.0 → 0.2.0
git add apps/cli/package.json apps/cli/src/constants.ts
git commit -m "chore: bump cli to 0.2.0"
npm run build
cd ../..
./launch-lms --version
```

## Troubleshooting

### Build fails
- Run `npm run build` locally first to catch TypeScript errors
- Check that the CLI dependencies are installed in `apps/cli/node_modules`
