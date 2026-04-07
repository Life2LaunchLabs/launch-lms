# Launch LMS CLI

This repository ships its CLI as local source code. It is meant to be run from this checkout through the repo-root launcher:

```bash
./launch-lms
```

The launcher installs `apps/cli` dependencies if they are missing, auto-builds `apps/cli/dist/bin/launch-lms.js` when the CLI source has changed, then runs the local bundle.

## Quick Start

From the repository root:

```bash
./launch-lms dev
```

That starts the local development environment for the app stack.

## Common Commands

```bash
./launch-lms setup
./launch-lms start
./launch-lms stop
./launch-lms logs
./launch-lms backup
./launch-lms doctor
./launch-lms shell
./launch-lms deployments
```

## Requirements

- Node.js 18+
- Docker with Docker Compose v2

## Local Build

If you want to rebuild the CLI manually:

```bash
cd apps/cli
npm run build
```

The repo-root launcher normally handles this for you.
