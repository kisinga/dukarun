# On-Device Product Recognition (Redesign)

**Status:** Design approved, pre-implementation. Spike (Task 0) is the gate.
**Supersedes:** `ML_TRAINING_SETUP.md` (the Teachable-Machine/`ml-trainer` pipeline — to be deleted).

---

## 1. Goal

Recognize inventory from the phone camera so the cashier can ring up an item by pointing
at it. Constraints that shape every decision:

- **Small catalog:** ~20 products per channel (a channel = one shop), max ~40.
- **The predicted label IS the product's DB id.** No separate label→product mapping.
- **Runs on a mobile phone**, fully **offline after first load**.
- **Robust to real-world photos** taken by non-expert shopkeepers — lighting, blur, angle,
  clutter must not flip the result.
- **Assistive, never authoritative.** It is an accelerator with a guaranteed fallback
  (barcode + manual search, already on the same screen). It must **bias toward
  "unsure → ask"** over guessing. A wrong charge is worse than no recognition.

## 2. Why the old pipeline is being deleted

The previous approach trained a per-channel classifier by driving Google Teachable Machine
through a headless browser (`ml-trainer/`), then shipped the model file to the client. It
never worked end-to-end (broken webhook loop, fragile UI scraping, unvalidated artifacts)
and, more fundamentally, training a softmax CNN per shop for ~20 changing products is the
wrong tool: it overfits, every new product forces a retrain, and it cannot say "not a
product." We are not fixing it. We are replacing it.

## 3. Approach — embeddings + nearest match (no training)

Ship **one frozen, pre-trained image embedder** ("describer") to the device, cached once.

- **Enroll** a product = run a few of its photos through the embedder → store the resulting
  fingerprint(s) on the Product.
- **Scan** = embed the live camera frame → cosine-match against the channel's cached
  fingerprints → return the product id of the best match, *if* it clears the confidence gate.

"Training" disappears. Adding a product = compute and save one fingerprint. Removing it =
delete the field. This is the same technique Teachable Machine used internally (frozen
feature extractor + nearest-neighbor), done directly and reliably.

### Where computation lives (no server in the scan loop)

| Layer | Runs | Touches server? |
|-------|------|-----------------|
| Embedder model file | On device (browser) | Once, to download; then cached forever |
| Fingerprints | Cached on device, ride the Product object | Only to sync when catalog changes |
| Scan / match | 100% on device | **Never** |
| Enrollment | On device | Only to store the fingerprint |

The backend runs **zero ML**. It stores and serves small number-lists.

## 4. Architecture — four units, composed

Mapped to the real seams. No new coordinator, no new cache service, no new detector
registration. (Detector interface confirmed in
`frontend/src/app/dashboard/pages/sell/components/detection/detection.types.ts`.)

1. **`EmbedderService`** — `providedIn: 'root'` singleton, near `core/services/ml-model/`.
   - `embed(source: HTMLVideoElement | HTMLCanvasElement): Promise<number[]>` (L2-normalized).
   - Owns: model load, the model-file IndexedDB cache (keyed `embedder/<name>-<EMBEDDER_VERSION>`,
     **one file shared across all channels**, not per-channel), and the shared preprocess
     (resize + center-ROI crop + normalize).
   - **Enrollment and inference inject the same instance** — that is how they "share one
     embedder": a DI singleton, not two constructions.

2. **`embedding-match.ts`** — a **pure** module (no Angular, no I/O), beside the service.
   - `cosineSim(a, b)`, `bestMatch(query, candidates) → { productId, score, margin }`
     (max-over-set per product), `calibrateTau(fingerprints) → { tau, margin }`.
   - **This is where matching lives** — not inside `MLDetector`, not on `ProductSearchService`
     (which stays a catalog lookup and must never learn what cosine similarity is).
   - Independently unit-testable; reused by enrollment's "too close to an existing product?" check.

3. **`MLDetector`** (rewritten body, **same constructor/Detector seam**) —
   `dashboard/pages/sell/components/detection/ml-detector.ts`.
   - Keeps `name = 'ml'`, the five `Detector` methods, and the `isProcessing()` span
     (true at entry, false in `finally`, covering embed + match + lookup).
   - **Composes** `EmbedderService` + `embedding-match` + `ProductSearchService` + `ScannerBeepService`.
   - `initialize()`: load the channel's fingerprint set into memory (from the already-cached
     products) + compute `{ tau, margin }` via `calibrateTau`.
   - `processFrame()`: embed the cropped frame → `bestMatch` → gate on `tau` **and** top1/top2
     `margin` → on pass, `getProductById(id)` to hydrate the display product → beep →
     `DetectionResult { type: 'ml', product, confidence }`.
   - **Below the gate → return `null`.** The coordinator already treats `null` as "keep
     scanning," so barcode and manual stay live with **zero coordinator/UI change**.

4. **Enrollment glue** — folded into the existing add/edit-product flow.
   - Multi-shot capture → same `EmbedderService.embed` → append fingerprint(s) to the Product
     custom field via mutation → trigger a cache `hydrateOne` so the product is scannable
     **this session** (the product cache does not self-invalidate on local writes).

**Untouched:** `detection-coordinator.ts` (registration, round-robin, busy-skip,
timeout/visibility), `barcode-detector.ts`, `camera.service.ts`, `product-scanner.component.ts`,
scanner UI.

## 5. Data model

Two **product-level** custom fields in
`backend/src/config/custom-fields/entity.custom-fields.ts` (`productCustomFields`, which
today holds only `barcode`):

- **`mlEmbedding`** — `type: 'text'`, `public: true`, `nullable: true`. JSON-encoded **array
  of per-image quantized fingerprints** (multi-shot, **not** a single centroid).
- **`mlEmbeddingVersion`** — `type: 'string'`, `public: true`, `nullable: true`. The single
  `EMBEDDER_VERSION` the fingerprints were enrolled with.

No new table. No second cache. No persisted threshold artifact (tau is recomputed from the
fingerprints at load).

### Version handling — collapsed, all-or-nothing

We ship one frozen embedder, so version is a compiled `EMBEDDER_VERSION` constant. At load,
compare it once to the stored `mlEmbeddingVersion`. On mismatch, treat the channel's
fingerprints as **absent** → recognizer reports not-ready → barcode-only + a "re-enroll"
nudge. **No per-frame version checks, no lazy mixed-space re-enrollment** (mixing embedding
spaces produces confident-wrong matches).

## 6. ⚠️ The five-layer wiring (or it's a silent no-op)

The current queries fetch only **variant-level** custom fields
(`customFields { wholesalePrice, allowFractionalQuantity }`) — **no product-level custom
fields at all**, and `ProductSearchResult` has no fingerprint field. The fingerprint must be
threaded end to end or the feature silently recognizes nothing:

1. Backend custom field `mlEmbedding` + `mlEmbeddingVersion` (above).
2. Add them to the selection set in **both** `GET_PRODUCT` *and* `PREFETCH_PRODUCTS`
   (`frontend/src/app/core/graphql/operations.graphql.ts`).
   **`GET_PRODUCT` must carry it too** — otherwise an unrelated price-edit SSE `hydrateOne`
   overwrites the cached product and deletes the fingerprint from the in-memory working set.
3. Map it in `product-mapper.service.ts` to a **typed `mlFingerprint` field** on
   `ProductSearchResult` (`product-search.service.ts`) — a typed field, **not** a generic
   `customFields` bag.
4. Persist it in the `ProductCachePayload` (`product-cache.service.ts`).
5. `MLDetector.initialize()` reads fingerprints off the already-cached products — no extra fetch.

## 7. Model choice

Ship behind the `Embedder` interface so the model is swappable, but **ship exactly one**
(building two runtime paths re-creates the `combined/legacy` branching we are deleting).

- **Default: the MobileNet / TF.js you already ship** (`@tensorflow/tfjs` is already a
  dependency; ~2–3 MB model, no new runtime).
- **Upgrade to MobileCLIP-S0 int8 (~12 MB model + ~4 MB ONNX runtime) only if the spike
  proves MobileNet's separability is insufficient.** MobileCLIP is contrastively trained, so
  it is more robust to lighting/clutter and better at look-alike SKUs — but it costs a new
  runtime and per-scan compute, so we don't pay for it until measurement says we must.

Verified sizes (one-time, cached): MobileCLIP-S0 vision encoder — int8 **11.8 MB**, fp16
22.9 MB, fp32 45.5 MB (Xenova ONNX). MobileNet feature extractor in our stack ≈ 2–3 MB.
Fingerprint dim: MobileNet ~1280, MobileCLIP 512.

## 8. Kill list

- Entire `ml-trainer/` microservice.
- Backend `ml-training.service`, `ml-training-scheduler`, `ml-webhook`, and the
  trainer-facing resolver mutations (`backend/src/plugins/ml/`, `backend/src/services/ml/`).
- Frontend: the `combined/legacy` model-format branch in `model-loader.service`;
  `MlModelService.predict()` + `getProductIdFromLabel` (already an identity);
  `ModelSourceResolverService` and per-channel model-asset machinery.
- Dead channel-level ML custom fields + their migrations.
- The hardcoded `confidenceThreshold = 0.9` (`ml-detector.ts:28`, compared at `:74`) and the
  `confidenceThreshold` constructor/component input.

**Before deleting**, per `CLAUDE.md`, run `gitnexus_impact` on the high-fan-in symbols:
`MlModelService.predict`, `getProductIdFromLabel`, `ModelLoaderService.loadModel`.

## 9. Task 0 — the spike (the gate; do this first)

**Riskiest assumption:** the enrollment↔scan distribution gap (staged enroll photos vs
handheld, off-angle, blurred, cluttered, fluorescent scan frames) is small enough that cosine
separates genuine SKUs from look-alikes. Nothing else in the design measures this. **No app
code** — a standalone harness.

**Setup:**
- 15–20 real SKUs, including 2–3 deliberate look-alike pairs (e.g. 500 ml vs 1 L of the same brand).
- Enroll 5–8 in-shop shots per SKU.
- Capture a **separate** scan set per SKU under deliberately bad conditions.

**Measure:**
- Genuine (intra-product) vs impostor (cross-product) cosine distributions.
- **Centroid vs max-over-set** top-1 accept + abstain rates.
- Look-alike top1/top2 margin.
- Simulate 2–3 "shops" (SKU subsets) to test a single global tau vs per-shop tau.
- `embed()` latency on a mid-tier Android.

**PASS/FAIL:** on the hard scan set —
- **False-accept rate ≤ 2%** (wrong-SKU confirmations), **AND**
- **Genuine top-1 accept ≥ 85%** (remainder abstaining gracefully), **AND**
- `embed()` within the **~100 ms / 2–4 fps** budget, **AND**
- max-over-set clears the bar where centroid does not (or they tie — only then is a centroid
  simplification safe).

**Decisions the spike makes for us:** MobileNet vs MobileCLIP-S0; centroid vs per-image;
single-global vs per-shop tau. If even max-over-set can't hit ≤2% false-accept on a
look-alike pair, those SKUs are **barcode/manual-only** and ML covers the visually-distinct
majority — fully consistent with assistive + fallback.

## 10. Build order (after the spike passes)

1. **Wiring (Section 6)** — thread the custom field through all five layers. Verify a
   fingerprint reaches `MLDetector.initialize()`. (Highest-risk plumbing; do it first.)
2. **`EmbedderService` + `embedding-match.ts`** — with unit tests on the pure matcher.
3. **`MLDetector` body swap** — compose the above; calibrated gate replaces `0.9`.
4. **Enrollment** — multi-shot capture in the add/edit-product flow + `hydrateOne`; backfill
   existing products once.
5. **Decommission (Section 8)** — only after 1–4 are green.

## 11. How we test

- **Spike:** Section 9 pass/fail is the go/no-go.
- **Matcher:** unit tests on `cosineSim` / `bestMatch` / `calibrateTau` (pure, deterministic).
- **Wiring:** assert a fingerprint survives `GET_PRODUCT`, `PREFETCH_PRODUCTS`, the mapper,
  the cache, and an unrelated `hydrateOne` (the price-edit overwrite trap).
- **Inference:** golden photo set → expected productId; measure accuracy, **false-accept on
  random non-products (must reject)**, look-alike margin behavior; latency on a low-end phone.
- **Offline:** airplane mode after first sync → scanning still works; evicted model cache
  re-fetches silently.
- **Lifecycle:** delete a product → its fingerprint is gone, never predicted.
- **Regression:** barcode scanning unaffected; coordinator/UI unchanged.

## 12. Open decisions

1. **Per-image fingerprints** (max-over-set) over a centroid — ~0.64 MB for 40×8×512;
   preserves abstention margin and correction-driven re-enrollment. *(Recommended; changes
   schema shape, hence flagged.)*
2. **Per-shop tau as a formula** (with a global floor/ceiling, top1/top2 margin as the primary
   abstain gate) over a hardcoded constant. *(Recommended.)*
3. **Center-ROI aim box** on the scanner (cashier aims the product through a box) — attacks
   clutter harder than any model upgrade; small UI affordance. *(Recommended.)*
4. **Scope:** primary target = barcode-less / hard-to-barcode items (loose produce, scuffed
   barcodes)? Onboarding guidance, not a code gate; keeps a half-enrolled catalog functional.

---

### Sources
- MobileCLIP (CVPR 2024): https://openaccess.thecvf.com/content/CVPR2024/papers/Vasu_MobileCLIP_Fast_Image-Text_Models_through_Multi-Modal_Reinforced_Training_CVPR_2024_paper.pdf
- ONNX vision-encoder sizes: https://huggingface.co/Xenova/mobileclip_s0 , https://huggingface.co/Xenova/mobileclip_s2
- MediaPipe Image Embedder: https://developers.google.com/edge/mediapipe/solutions/vision/image_embedder
