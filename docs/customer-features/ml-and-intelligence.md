## Machine Learning & Smart POS Intelligence

This guide explains Dukarun's AI-assisted product recognition after the removal of the
Teachable-Machine / `ml-trainer` pipeline.

---

## What Problems This Solves

- Make checkout faster by reducing manual search.
- Help non-barcode environments such as fresh produce, salons, kiosks, and informal retail.
- Let each business enroll its own labels or service cards without waiting for a backend model
  training job.

---

## Key Capabilities

- **Label-photo product recognition at POS** - cashiers point the camera at a label or service
  card and Dukarun suggests the matching product.
- **On-device embeddings** - the browser turns enrolled images and live camera frames into
  comparable vectors.
- **Product-level enrollment** - product custom fields store the recognition fingerprint, so the
  POS can work from the normal product cache.
- **Offline-first matching** - once products and the embedder are loaded, matching can continue
  without a live training service.
- **Manual fallback** - barcode scanning and product search remain available when confidence is
  low or a product has not been enrolled.

---

## Label-Photo Recognition

### 1. Why Labels, Not Products

Many small and informal retailers sell items that are visually similar or hard to distinguish from
raw camera frames. Dukarun recognizes the label or service card instead:

- The merchant already has labels such as "TOMATO 10/=" or "Kids Haircut 300/=".
- The label is more stable than the product itself.
- The cashier keeps the same workflow and gets a faster lookup path.

---

### 2. Day-to-Day POS Flow

1. A cashier opens the **Sell** page.
2. They tap the camera / scan control and point at the label or card.
3. The frontend crops the region of interest and creates an embedding.
4. Dukarun compares that embedding with cached product fingerprints.
5. If confidence is high enough, the product is suggested or added to the cart.
6. The cashier can accept the suggestion, choose a variant, or fall back to search/barcode.

---

## Enrollment Model

### 1. Product Fingerprints

Recognition data is stored with the product, not as a separate per-channel model asset:

- `customFields.mlEmbedding` stores one or more image embeddings as JSON.
- `customFields.mlEmbeddingVersion` records which embedder produced those vectors.
- The product cache maps those fields into `ProductSearchResult.mlFingerprint`.

This keeps recognition data close to catalog data and avoids a separate model deployment flow.

---

### 2. Enrolling a Product

1. Create or edit a product.
2. Capture clear label/card photos in normal store lighting.
3. The frontend embedder converts those photos into embeddings.
4. The product is saved with the embedding payload and embedder version.
5. The next product prefetch includes the fingerprints for offline matching.

Use several photos when labels vary by angle, distance, or handwriting.

---

## Offline-First POS Intelligence

The recognition path is tied to the POS cache:

- Dashboard startup prefetches products into IndexedDB and memory.
- Product mapping parses `mlEmbedding` once at the GraphQL boundary.
- Scanning compares camera-frame embeddings against cached fingerprints.
- If the network drops, matching still works for products already cached on the device.

The cache can be refreshed by reopening the dashboard, switching company, or running the normal
product prefetch flow after product updates.

---

## Operational Notes

- There is no `ml-trainer` workspace or training service in the active architecture.
- There are no channel-level `mlModelJsonAsset`, `mlModelBinAsset`, or `mlMetadataAsset` fields.
- There is no model upload/versioning workflow for TensorFlow.js model files.
- The retained ML code is the on-device recognition stack under
  `frontend/src/app/core/services/ml-model/` and the scanner/enrollment UI.

---

## Fallbacks & Limits

- Barcode scanning remains the fastest path for packaged goods.
- Manual search remains the universal fallback.
- Recognition quality depends on clear enrollment images and consistent labels.
- A changed embedder version should trigger re-enrollment or cache refresh for affected products.
