# GitHub Actions Workflows

This directory contains the CI/CD workflows for the dukarun project.

## Workflow Overview

### 1. Test Suite (`test.yml`)

- **Purpose**: Runs backend and frontend tests and uploads coverage (per-job and combined).
- **Triggers**: `push` and `pull_request` to the `main` branch only.
- **Jobs**:
  - **test-backend**: Build and test backend (Node 20). Uploads backend coverage artifact and to Codecov.
  - **test-frontend**: Build and test frontend (Node 20, Chrome). Uploads frontend coverage artifact and to Codecov.
  - **coverage-combined**: Runs after both test jobs (even if one fails). Downloads available coverage artifacts and uploads combined coverage to Codecov when files exist.
- **Environment**: Both test jobs run with `HUSKY=0` so git hooks are not installed in CI (root `prepare` also skips when `CI=true` or `HUSKY=0`).
- **Node.js**: v20 for all jobs.

### 2. Docker image builds

Docker images are built by **Coolify** (or locally via `docker compose build`) from the Dockerfiles defined in `docker-compose.yml`. There is no separate CI workflow that builds and pushes to a registry.

## Branch Protection Setup

To require tests to pass before merging into `main`:

1. Go to repository **Settings → Branches**.
2. Add or edit a rule for the `main` branch.
3. Enable **Require status checks to pass before merging**.
4. Select the status checks from the Test Suite workflow:
   - **test-backend**
   - **test-frontend**
   - (Optional) **coverage-combined** if you want combined coverage to block merge; usually the two test jobs are sufficient.
5. Save. Merging into main will then be allowed only when CI is green.

## Node.js Version

All workflows use Node.js v20. The root `package.json` documents this with `"engines": { "node": ">=20" }`.
