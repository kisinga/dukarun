# Decommissioning the Old ML Training Pipeline

Removes the Teachable-Machine / `ml-trainer` training pipeline now that on-device recognition
(`ML_PRODUCT_RECOGNITION_IMPLEMENTATION.md`) replaces it. This is a **cross-service cascade** —
do it in order, verify at each gate, one phase per commit. Nothing here touches the new
recognition code (embedder / matcher / enrollment / the two product custom fields).

## Why ordered

The frontend's `ml-training.service` uses GraphQL ops generated from the **backend** ML resolver.
If you delete the backend resolver first and re-run codegen, those generated ops vanish and the
frontend breaks mid-teardown. So: **remove frontend consumers → remove backend provider → codegen
→ then the isolated super-admin / ml-trainer / infra.**

## Prerequisite

The new recognition feature must be **activated and building green first** (backend restarted with
the new custom fields, `npm run codegen`, `ng build` clean). Decommission from a known-good baseline,
on a branch.

---

## Phase 1 — Frontend: delete the old TF.js recognition runtime

**Delete** (all superseded by `embedder.service.ts` / `embedding-match.ts`):
- `frontend/src/app/core/services/ml-model/`: `model-loader.service.ts`, `model-predictor.service.ts`,
  `model-source-resolver.service.ts`, `model.types.ts`, `ml-model.service.ts`, `tensorflow.util.ts`,
  `model-error.util.ts`
- `frontend/src/app/core/services/ml-model.loader.ts`

**Edit:**
- `frontend/src/app/core/index.ts` — remove the 3 `export * from './services/ml-model/{ml-model.service,model.types,model-error.util}'` lines.
- `frontend/src/app/core/services/app-init.service.ts` — remove the old-model preload (`loadMlModelService`
  import + `MlModelService`/`ModelErrorType` imports, the `mlModelService` field, `ensureMlModelService()`,
  and its call site ~L165). The new `EmbedderService` is lazy — no boot preload needed.

**KEEP:** `embedder.service.ts`, `embedding-match.ts` (+ `.spec.ts`), `enrollment.service.ts`, `frame-roi.ts`.

**Gate:** `cd frontend && ng build` clean.

## Phase 2 — Frontend: delete the training UI + operations

**Delete:**
- `frontend/src/app/core/services/ml-training.service.ts`
- `frontend/src/app/dashboard/pages/settings/components/ml-model-status/` (component + html)

**Edit:**
- `frontend/src/app/app.routes.ts` — remove the `path: 'ml-model'` route (~L372) that lazy-loads
  `MlModelStatusComponent`, and any settings-nav link to it.
- `frontend/src/app/core/graphql/operations.graphql.ts` — delete the training ops: `GET_ML_TRAINING_INFO`,
  `GET_ML_TRAINING_MANIFEST`, `EXTRACT_PHOTOS_FOR_TRAINING`, `START_TRAINING` (and any sibling
  `*MlTraining*`/`*MlModel*` mutations/queries in that block). Leave the new product-embedding path alone.

**Gate:** `ng build` clean (generated types still contain the ops — harmless until Phase 4).

## Phase 3 — Backend: remove the ML plugin, services, channel fields

**Edit `backend/src/vendure-config.ts`:** remove `import { MlModelPlugin }` (L33) and `MlModelPlugin`
from the `plugins` array (L233).

**Delete:**
- `backend/src/plugins/ml/` (`ml-model.plugin.ts`, `ml-model-resolver.ts`, `ml-extraction-queue.subscriber.ts`,
  `ml-training-scheduler.ts`, `ml-service-auth.guard.ts`, `ml-webhook-test.ts`)
- `backend/src/services/ml/` (`ml-auto-extract.service.ts`, `ml-extraction-queue.service.ts`,
  `ml-training.service.ts`, `ml-webhook.service.ts`)
- `backend/scripts/deploy-ml-model.js`

**Edit `backend/src/config/custom-fields/channel.custom-fields.ts`:** remove all 11 `ml*` fields
(`mlModelJsonAsset`, `mlModelBinAsset`, `mlMetadataAsset`, `mlTrainingStatus`, `mlTrainingProgress`,
`mlTrainingStartedAt`, `mlTrainingError`, `mlTrainingQueuedAt`, `mlLastTrainedAt`, `mlProductCount`,
`mlImageCount`). **Do NOT touch the Product `mlEmbedding`/`mlEmbeddingVersion` fields.**

**Edit** `backend/src/infrastructure/config/environment.config.ts` (+ `.env.example`, `backend/Dockerfile`):
remove `ML_TRAINER_URL` / ML service-token env vars.

**New migration** `backend/src/migrations/9800000000000-DropChannelMlTrainingFields.ts`: drop the
channel `customFieldsMl*` columns and the `ml_extraction_queue` table (`DROP ... IF EXISTS`, guarded;
mirror the down-migration pattern). Do NOT edit the old migrations `1000000000002`, `1000000000011`,
`6000000000000` — supersede them.

**Gate:** `cd backend && npx tsc --noEmit` clean; restart backend; boot clean (migration runs).

## Phase 4 — Frontend: codegen against the ML-free schema

- `cd frontend && npm run codegen` — regenerates types without the removed ML ops.
- `ng build` — **any lingering reference to a removed op surfaces here.** Should be none after Phase 2.

## Phase 5 — super-admin app: remove the ml-trainer console

`super-admin/` is a separate app that monitors `ml-trainer`. **Delete:**
- `super-admin/src/app/pages/ml-trainer-management/` (component)

**Edit:** `super-admin/src/app/app.routes.ts` (route), `layout/nav.types.ts` + `layout.component.ts`
(nav entry), `pages/dashboard/dashboard.component.html` (ml-trainer card), `shared/components/nav-icon`
(icon if unused elsewhere). Backend side: `backend/src/plugins/super-admin/super-admin.resolver.ts`
(the `ml-trainer` health entry, ~L206-218) + `super-admin.schema.ts` (any ml-trainer field).

**Gate:** `cd super-admin && npm run build` clean; backend `tsc` clean.

## Phase 6 — Remove the ml-trainer workspace + infra

**Delete:** `ml-trainer/` (whole directory).

**Edit:**
- root `package.json` — remove `"ml-trainer"` from `workspaces` and the `dev:ml` script.
- `docker-compose.yml` (+ `docker-compose.*.yml`) — remove the `ml-trainer` service (and any `depends_on`).
- `dockerignore.backend`, `dockerignore.frontend`, `dockerignore.super-admin`, `frontend/Dockerfile`,
  `backend/Dockerfile` — remove `ml-trainer` lines.
- `scripts/setup.ts` — remove ml-trainer setup steps.

**Gate:** `npm install` (workspaces resolve clean); `docker compose config` valid.

## Phase 7 — Docs + final

- Delete `docs/ML_TRAINING_SETUP.md` (obsolete). Update `docs/INFRASTRUCTURE.md`,
  `docs/DOCKER_WORKSPACE_BUILDS.md`, `docs/customer-features/ml-and-intelligence.md` to drop ml-trainer.
- Full green build: backend `tsc`, frontend `ng build`, super-admin build.
- **`spikes/recognition/`** — keep until the pre-launch separate-session accuracy test
  (`ML_PRODUCT_RECOGNITION.md` §9) is run; it's the only tool for it. Delete after. (Safe to delete
  anytime — nothing imports it; the logic already lives in `embedding-match.ts` / `embedder.service.ts`.)

---

## Risks / notes

- **Destructive migration** (Phase 3): dropping channel columns + `ml_extraction_queue` deletes dead
  training state. Irreversible in prod without a restore — but the data is unused. Guard every drop with `IF EXISTS`.
- **Codegen ordering is load-bearing** — Phase 2 (frontend ops) MUST precede Phase 3/4, or codegen breaks the frontend.
- **super-admin is separately deployed** — Phase 5 is optional for *function* (a dead "ml-trainer unavailable"
  health row is harmless) but required to fully remove the pipeline.
- **Do not touch:** Product `mlEmbedding`/`mlEmbeddingVersion`, migration `9700000000000`, and everything under
  `core/services/ml-model/{embedder,embedding-match,enrollment,frame-roi}`.
