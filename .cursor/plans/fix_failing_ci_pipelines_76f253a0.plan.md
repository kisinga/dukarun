---
name: Fix failing CI pipelines
overview: Fix the Test Suite so it runs on PRs against main and on push to main, allows merging only when CI is green, and fix the root cause of current failures (husky in CI and coverage-combined artifact download).
todos: []
---

# Fix failing CI pipelines

## Root cause from your logs

The logs show the real failure:

- **`sh: 1: husky: not found`** in both backend and frontend jobs during `npm ci`.
- The root [package.json](package.json) has `"prepare": "husky install"`. In a workspace repo, when the job runs `cd backend` (or `cd frontend`) and then `npm ci`, npm still runs the **root** `prepare` script. At that point either the root is not fully installed (only the workspace subdir is) or `husky` is not on PATH, so the shell fails with exit code 127.
- Because **test-backend** and **test-frontend** fail at install, they never upload coverage. The **coverage-combined** job then fails with **"Artifact not found for name: backend-coverage"** (and would fail on frontend-coverage if only backend had passed).

So the pipeline is failing at install (husky), not at tests. Fixing husky and making coverage-combined resilient to missing artifacts unblocks CI.

---

## Desired flow and "CI runs twice"

You want:

1. Pipelines run when a PR is raised against **main**.
2. Merging allowed only after CI is green (branch protection).
3. Clarification: is it pragmatic that CI runs twice (on PR + after merge)?

**Yes, it's pragmatic.** Recommended setup:

- **Trigger 1 – `pull_request` to `main`**: Runs on every push to a branch that has an open PR targeting main. This is the "proposed change" check; you need it green before merge.
- **Trigger 2 – `push` to `main`**: Runs when something is pushed to main (including the merge commit). This confirms main stays green after merge and keeps the main branch status accurate.

So: one run validates the PR; the other validates main after merge. No change to this double-run design; we only tighten **when** the workflow runs (PRs against main + push to main).

---

## Plan

### 1. Trigger only on PRs targeting main and on push to main

**Problem**: Today the workflow runs on `push` and `pull_request` for `main` and `develop`. You want CI to gate merges to main, so the important triggers are: (1) when a PR targets main, (2) when code is pushed to main.

**Change**: In [.github/workflows/test.yml](.github/workflows/test.yml), set:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

Remove `develop`. Result:

- CI runs when a PR is opened or updated **against main** (so status checks appear on the PR and can be required for merge).
- CI runs on every **push to main** (including after merge).
- Branch protection: in GitHub **Settings → Branches → Add rule for main**, enable "Require status checks to pass before merging" and select the status checks from this workflow (e.g. `test-backend`, `test-frontend`). Then merging is allowed only after CI is green.

### 2. Fix husky in CI (root cause of install failure)

**Problem**: Root `prepare` runs `husky install`; in CI this runs in a context where `husky` is not on PATH (or root is not installed), so the command fails and `npm ci` exits 127.

**Change**: Make the root `prepare` script a no-op in CI so we never invoke `husky` there. In [package.json](package.json) (repo root), replace the prepare script with one that skips when `CI=true` or `HUSKY=0`:

```json
"prepare": "node -e \"if (process.env.CI === 'true' || process.env.HUSKY === '0') process.exit(0); require('child_process').execSync('npx husky install', {stdio:'inherit'})\""
```

- In CI, GitHub Actions sets `CI=true`, so the script exits 0 and does nothing; no `husky` binary required.
- Locally, `prepare` still runs `npx husky install` so git hooks are installed as today.

Optional hardening: in [.github/workflows/test.yml](.github/workflows/test.yml), add at job level for `test-backend` and `test-frontend`:

```yaml
env:
  HUSKY: 0
```

So even if something unsets `CI`, husky is skipped. This is redundant with the script change but makes intent explicit.

### 3. Make coverage-combined resilient to missing artifacts

**Problem**: When `test-backend` (or `test-frontend`) fails, its coverage artifact is never uploaded. `coverage-combined` runs with `if: always()` and tries to download both artifacts. "Download backend coverage" has no `continue-on-error`, so the job fails with "Artifact not found for name: backend-coverage".

**Change**: In [.github/workflows/test.yml](.github/workflows/test.yml), add `continue-on-error: true` to the "Download backend coverage" step (mirroring the frontend download). The existing "Upload combined coverage" script already handles missing files; this only prevents the job from failing when one of the test jobs didn't upload.

### 4. Optional robustness and consistency

- **Backend Node version**: In [.github/workflows/test.yml](.github/workflows/test.yml), set backend job to `node-version: '20'` so both jobs use Node 20 (simpler and aligned with Angular 21).
- **Frontend test stability**: In [frontend/package.json](frontend/package.json), add `--no-progress` to the `test:ci` script to reduce risk of Karma hanging in CI:  

`"test:ci": "CI=true ng test --code-coverage --watch=false --no-progress"`

---

## Summary of file changes

| File | Change |

|------|--------|

| [.github/workflows/test.yml](.github/workflows/test.yml) | Triggers: `push` and `pull_request` only for `main`. Add `env.HUSKY: 0` to test-backend and test-frontend. Add `continue-on-error: true` to "Download backend coverage". Optionally set backend `node-version: '20'`. |

| [package.json](package.json) (root) | Make `prepare` skip husky when `CI=true` or `HUSKY=0` (node one-liner). |

| [frontend/package.json](frontend/package.json) | Optional: add `--no-progress` to `test:ci`. |

No changes to [.github/workflows/build-and-push.yml](.github/workflows/build-and-push.yml) for this flow. Branch protection (require status checks on main) is configured in GitHub repo Settings, not in the workflow file.

---

## What you need to do in GitHub

After the workflow and script changes:

1. **Branch protection for main**: Settings → Branches → Add rule for `main` → enable "Require status checks to pass before merging" → choose the status checks from the Test Suite (e.g. `test-backend`, `test-frontend`). Save. Then merging into main is allowed only when CI is green.
2. Re-run or push a new commit on a PR targeting main to confirm the Test Suite passes and the PR shows green.