# On-Device Recognition — Locked Implementation Plan

Companion to `ML_PRODUCT_RECOGNITION.md` (the *why*). This is the *how* — concrete per-file
changes, validated against the current tree. Model/match/data are **locked**: MobileCLIP-S0
fp32, centroid, `calibrateTau`, two product custom fields. All paths verified.

---

## STATUS — Implemented 2026-07-01 (verified except the codegen-gated step)

Layers A–G are **built**. Verified: backend `tsc` clean; matcher unit logic 20/20; frontend
`ng build` compiles **all new code with zero errors** — the only remaining errors (7) are the
expected `graphql()`→`unknown` ones at the GET_PRODUCT/PREFETCH usage sites, which clear the
moment `npm run codegen` runs against a backend that exposes the new fields.

**Deltas from the original plan (decided during the build):**
- **Barcode made coherent + offline** (Coherent Entity Representation): GET_PRODUCT/PREFETCH also
  fetch `barcode`; it's mapped onto `ProductSearchResult` and indexed (`productsByBarcode`), and
  `searchByBarcode` is now cache-first — so **barcode scanning works offline too**, matching ML.
- **Shared ROI util** `core/services/ml-model/frame-roi.ts` — enrollment AND scanning crop through
  the same code (the enroll↔scan parity guarantee, not two copies).
- **Enrollment** is a composed `EnrollmentService`; its write uses an **inline `gql` mutation**
  (`product-api.service.updateProductEmbedding`) so it needs no codegen. Same-session scannability
  via `ProductCacheService.setProductFingerprint` (targeted — no variant clobber).
- **EmbedderService** D1/D2 fixes applied (local ORT `wasmPaths`, per-frame tensor dispose).
- **Bundler fix:** the SSR/server bundle pulled native `onnxruntime-node` → `angular.json`
  `externalDependencies: ["onnxruntime-node","sharp"]` (the browser bundle already resolves the
  web build cleanly).
- **UX:** square aim box matching the ROI, "Preparing recognition…/unavailable" status banner,
  honest footer, ≥44px Stop, non-blank error/idle states, object-URL photo previews.

**ACTIVATION (human — needs a backend restart this session deliberately avoided):**
1. Restart the backend so it registers the new Product custom fields.
2. `cd backend && npm run build && npm run migration:run` (migration `9700000000000` is also auto-run on boot).
3. `cd frontend && npm run codegen` (needs the backend up with the new fields) → clears the 7 errors.
4. `npm run build`. For full offline: `npm run ml:fetch-model` (downloads the ~45 MB model into `public/assets/ml/`).

**DECOMMISSION is deferred** (see §5) — it's a cross-service cascade that needs codegen + a full
build to verify, so it should be done as a follow-up after activation, not blind.

---

## 1. Layer map — per-file changes

### A. Backend data (field + migration)
- **`backend/src/config/custom-fields/entity.custom-fields.ts`** (`productCustomFields`, today only `barcode`):
  add `mlEmbedding` (`type:'text'`, `public:true`, `nullable:true` — JSON array of per-image fp32
  fingerprints) and `mlEmbeddingVersion` (`type:'string'`, `public:true`, `nullable:true`).
  `public:true` is mandatory or the field never enters the GraphQL schema (that's how `barcode` works).
- **`backend/src/migrations/97xxx-AddProductMlEmbeddingFields.ts`** (NEW): mirror
  `9400000000003-AddOrderCogsStatusField.ts` — `DO…END` guard + `ALTER TABLE "product" ADD COLUMN
  IF NOT EXISTS`. Columns: `customFieldsMlembedding text`, `customFieldsMlembeddingversion varchar(255)`.
  **Verify the lowercased casing against the live `customFieldsBarcode` column before running** (the trap).

### B. The 5-layer GraphQL/cache threading (the silent-no-op trap)
- **`operations.graphql.ts`**: `GET_PRODUCT` (~608) and `PREFETCH_PRODUCTS` (~691) — add a product-level
  `customFields { barcode mlEmbedding mlEmbeddingVersion }` block. **Must include `barcode`** — GET_PRODUCT
  has no product-level block today, so omitting it regresses barcode on every `hydrateOne`.
- **`product-mapper.service.ts`** (`toProductSearchResult`, ~14): the single parse boundary — `JSON.parse`
  `mlEmbedding` → `number[][]` (try/catch → `undefined`); pass `mlEmbeddingVersion` through. Parse **once** here.
- **`product-search.service.ts`** (`ProductSearchResult`, ~48): add typed `mlFingerprint?: number[][]` and
  `mlEmbeddingVersion?: string` (typed fields, not a generic `customFields` bag).
- **`product-cache.service.ts`**: NO change — it stores `ProductSearchResult[]`, so fingerprints ride along.
  Once GET_PRODUCT carries the field, `hydrateOne` (~379) round-trips it instead of wiping it.

### C. `EmbedderService` (NEW — `core/services/ml-model/embedder.service.ts`)
- `@Injectable({providedIn:'root'})`, no backend I/O. One singleton shared by enroll + inference.
- **Reuse the `ml-model.loader.ts` cached-promise pattern** (store `initPromise`, not a boolean — dedupes
  parallel first-frames, closes the init race).
- `initialize()`: `await import('@huggingface/transformers')` (dynamic → out of main bundle) →
  `AutoProcessor` + `CLIPVisionModelWithProjection`; config `[{webgpu,fp32} if navigator.gpu, {wasm,fp32}]`
  with try/catch fallback (port `embedders.js`), but `env.allowRemoteModels=false` +
  `env.localModelPath='/assets/ml/'` (offline). `progress_callback` → Angular signal for the 45MB loader.
- `embed(source: HTMLCanvasElement): Promise<number[]>` — **one input type**: `RawImage.fromCanvas(source)
  .rgb()` (canvas is RGBA — `.rgb()` mandatory) → `processor` → `vision` → `image_embeds` → `l2norm`.
- **Warmup** one blank-canvas `embed()` after init (ONNX compiles on first run). Reuse ONE canvas instance.
  `embed()` throws on failure (callers decide policy).

### D. `embedding-match.ts` (NEW — pure, beside the service)
- Port **only** `l2norm, cosineSim, centroid, buildCandidates, bestMatch, calibrateTau` from `match.js`.
  **Drop** the harness/oracle fns (`scoreAll, evaluateAt, rawTop1Accuracy, findOperatingPoint,
  lowestMarginProducts`) — test-only, no place in the app bundle.
- `bestMatch`: default `mode='centroid'`. Guard empty candidates, wrong dim (≠512), empty centroid → abstain.
- `calibrateTau`: **add the false-accept safety floor** (the one functional change). Raise the lower clamp
  `0.2 → TAU_FLOOR≈0.5`, floor `marginMin` at `0.04`, and on overlap push `tau = max(TAU_FLOOR, impHi+0.03)`.
  Shipping `match.js` as-is reproduces the 8.6%-FA failure the spike caught.

### E. `MLDetector` body swap (`detection/ml-detector.ts` — keep `name='ml'`, the 5 methods, the `isProcessing` span)
- Constructor: drop `confidenceThreshold`, inject `EmbedderService`.
- `initialize()`: build `enrollMap` from cached products where `mlEmbeddingVersion===EMBEDDER_VERSION` AND
  `mlFingerprint` present (**filter stale-version products out per-product**, not whole-channel abort);
  zero match → not-ready → barcode-only. `buildCandidates → calibrateTau → {tau,margin}`. Arm ML only when
  **≥3 enrolled products** (the resolved floor) are present (prevents half-catalog false-accepts).
- `processFrame(video)`: guard `video.readyState>=2` (a `<2` frame is black → garbage). Draw a **centered
  square ROI** to the reused canvas (the real enroll↔scan parity fix; also drives the **visible aim box** —
  decision 3) → `embed` → `bestMatch` → gate
  `score>=tau && margin>=marginMin` else `null` → `getProductById` → **reject `!product || !product.enabled`**
  → beep → result. Wrap embed in try → `null` on throw (abstain, never surface, never block barcode).
- **`product-scanner.component.ts:229-235`** (the one caller, d=1 WILL-BREAK): update the `new MLDetector(...)`
  signature in the same commit; remove the dead `confidenceThreshold` input.

### F. Enrollment glue + write mutation
- **`operations.graphql.ts`** + **`product-api.service.ts`** (~86-135): extend the existing `UPDATE_PRODUCT_*`
  mutations so `customFields` also accepts `mlEmbedding`/`mlEmbeddingVersion` (reuse the proven `barcode`
  write path + its admin permission — no new mutation).
- **`product-create.component.ts`** (`onSubmit` Phase 2, ~1110): after product created, for each captured
  photo draw to canvas with the **same centered-square ROI**, `embedderService.embed(canvas)` (the single
  shared path — enroll and scan must not diverge), collect vectors → `JSON.stringify` →
  `updateProduct({mlEmbedding, mlEmbeddingVersion:EMBEDDER_VERSION})`. **Non-blocking** (like the existing
  "add photos later"); never block creation on a 45MB cold model.
- **Fires on create AND edit** (decision 4 — no backfill, so the edit path is the main on-ramp). If product
  edit reuses this component's `onSubmit`, it's covered; otherwise add the same hook to the edit flow.
- Same-session scannable: call `cacheService.hydrateProduct(mutationResult)` (in-memory, ~208) — **NOT**
  `hydrateOne` (re-fetches; wipes the fingerprint if F deploys before B).

### G. Service worker / offline / deps
- **`ngsw-config.json`**: add ONE assetGroup `ml-runtime` (`installMode:'lazy'`, `updateMode:'prefetch'`,
  files `["/assets/ml/**", "/*.wasm"]`). Bundle the fp32 model under `/assets/ml/mobileclip_s0_fp32/`.
  Add `navigator.storage.persist()` once at first model load (Cache API + IndexedDB are evictable);
  on `initialize()` failure → fail loud once (toast) + hard barcode fallback.
- **`package.json`**: add `@huggingface/transformers` (pin exact; confirm `onnxruntime-web` peer doesn't
  conflict with the graphql@16 / TS<6 caps before locking). Keep `@tensorflow/tfjs` (barcode). Verify
  post-build that the transformers chunk is lazy (not in main) and `*.wasm` is in `ngsw.json`.

---

## 2. What the validation changed vs the design doc

- `calibrateTau` gets a real FA floor (`TAU_FLOOR≈0.5`, `marginMin≥0.04`) — the doc said "keep a floor"
  but the prototype clamps to 0.2.
- Preprocessing parity nailed: `embed(canvas)` only; enroll + scan both draw through the same centered ROI;
  added `.rgb()` and `readyState>=2`. The **centered ROI** is the highest-impact parity fix.
- Fixed the lingering "WASM/int8 fallback" wording → **WASM/fp32**.
- Port only 6 pure fns from `match.js`, not the whole file.
- Parse the fingerprint **once** in the mapper to a typed `number[][]`.
- Lazy-load transformers.js via the existing cached-promise pattern; ngsw caches a **local** model
  (cut the phantom CDN dataGroup); add `storage.persist()`.
- MLDetector hardening: reject `!enabled`, per-product version filter, enrolled-product floor, warmup,
  one reused canvas, latency kill-switch.
- Enrollment uses `hydrateProduct(mutationResult)`, not `hydrateOne`; non-blocking. GET_PRODUCT must also
  carry `barcode` (wipe trigger is every sale's stock-change SSE, not just price edits).
- Storage stays fp32 JSON (≈0.64MB for 40×8×512 — trivial); quantizing the *stored vector* is deferred.

---

## 3. Build order (riskiest first; each independently verifiable)

1. **5-layer wiring (A+B).** Seed a product's `mlEmbedding` via SQL → assert it reaches
   `getProductById()` after PREFETCH **and survives an unrelated `hydrateOne`** (the stock-change wipe).
2. **`embedding-match.ts` (D).** Pure — unit tests green (centroid, margin gate, `calibrateTau` floor).
3. **`EmbedderService` (C).** Parity check: `embed(canvas)` of a known image ≈ the spike's vector (cosine≈1)
   on WebGPU and WASM.
4. **ngsw + offline (G).** Build → `*.wasm` + model in `ngsw.json`; airplane-mode reload still loads.
5. **MLDetector swap (E) + the d=1 caller.** Scanner recognizes a seeded product; below-gate → barcode fires;
   disabled product not recognized; compiles.
6. **Enrollment (F).** Add product w/ photos → written → scannable same session via `hydrateProduct`.
7. **Decommission (kill list).** Only after 1–6 green.

---

## 4. Test strategy (the two load-bearing checks)

- **fingerprint-survives-hydrateOne**: seed → `hydrateOne` → assert `mlFingerprint` still set (the stock-change wipe guard).
- **preprocessing-parity**: same image through the spike's `read(url)` path and the app's `fromCanvas().rgb()`
  path → cosine ≈ 1.0 on WebGPU and WASM (the enroll↔scan parity guard).
- Plus: matcher unit tests (FA floor, guards); MLDetector golden set + false-accept-rejects + disabled-product
  + below-gate→barcode; offline reload; barcode/coordinator/UI regression (untouched by design).

---

## 5. Kill list + `gitnexus_impact` targets

Run `gitnexus_impact` first on: `MlModelService.predict`, `MlModelService.getProductIdFromLabel`,
`ModelLoaderService.loadModel`, and the trainer resolver mutations.

- **Delete:** `ml-trainer/`; `backend/src/plugins/ml/` + `backend/src/services/ml/` (training/extraction/
  scheduler/webhook); the old TF.js frontend set in `core/services/ml-model/` (`model-loader`,
  `model-predictor`, `model-source-resolver`, `model.types`, `ml-model.service`, `ml-model.loader` after
  lifting its cached-promise pattern) + `ml-training.service.ts`.
- **Edit:** `channel.custom-fields.ts` — drop the `mlTraining*`/`mlModel*Asset`/`mlProductCount`/`mlImageCount`
  fields (do **not** add channel-level embedder state — product-level version is the source of truth);
  no-op the dead channel ML columns in a down-migration. `ml-detector.ts` + `product-scanner.component.ts`
  (covered above).
- **Keep:** `spikes/recognition/` (reference); `@tensorflow/tfjs` (barcode).

---

## 6. Decisions (resolved)

1. **EMBEDDER_VERSION = `mobileclip-s0-fp32-v1`** (encodes dtype, not device), frozen for the feature's
   life. `console.warn` on mismatch; **no admin "re-enroll all" tool for MVP** (deferred).
2. **Arm floor N = 3** products (≥3 fingerprints each). Below that → barcode-only.
3. **Aim box: yes** — show a centered square guide in the scanner. (The ROI crop happens regardless;
   this just draws the guide.)
4. **No backfill** — products become recognizable only when **created OR edited with photos**.
   Consequences: (a) the Layer-F enrollment hook must fire on **both the create and the edit paths**
   (verify product edit reuses `product-create.component`'s `onSubmit`, or add the hook to the edit flow);
   (b) the existing catalog is **barcode-only until each product is re-saved** — surface this in the UI
   ("add photos to enable camera recognition") so it's a visible opt-in, not silent dead weight.
