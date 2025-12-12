## Machine Learning & Smart POS Intelligence

This guide explains Dukarun’s **AI-powered features** – what they do for merchants and how they are structured behind the scenes.

---

## What Problems This Solves

- Make checkout **faster and less error-prone** by reducing manual typing.
- Help non-barcode environments (fresh produce, salons, informal retail) go digital without big hardware investments.
- Provide a path to **per-business AI models** trained on that business’s own labels and catalog.

---

## Key Capabilities (with Origins)

- **Label-photo product recognition at POS** – Recognise handwritten price labels and service cards using the phone camera.  
  **Origin:** Dukarun-Exclusive (frontend ML + backend pipeline).

- **Per-channel ML models** – Each business can have its own model trained on its own data.  
  **Origin:** Dukarun-Exclusive (see `ARCHITECTURE.md`, `ML_TRAINING_SETUP.md`).

- **Automated photo extraction & manifest generation** – Generate training datasets and manifests from existing product images.  
  **Origin:** Dukarun-Exclusive.

- **Model upload and versioning** – Integrate with external training services and store trained models in Vendure assets.  
  **Origin:** Dukarun-Exclusive (ML plugin).

- **Offline-first model usage** – Cache models on the device for faster and more resilient inference.  
  **Origin:** Dukarun-Exclusive (frontend architecture).

---

## Label-Photo Recognition (How It Works for Merchants)

### 1. Why Labels, Not Products

Many small and informal retailers:

- Sell items that look very similar (e.g. tomatoes vs oranges vs onions).
- Use handwritten **price tags or cards** already at their stalls.

Instead of trying to recognise the product itself (which is variable and visually noisy), Dukarun:

- Teaches the model to recognise the **label** (“TOMATO 10/=”, “Kids Haircut 300/=”).
- Keeps the merchant’s existing workflow:
  - They keep writing price tags.
  - Dukarun simply learns those tags.

**Origin:** Dukarun-Exclusive design (see “Product Model” and “Services” in `frontend/ARCHITECTURE.md`).

---

### 2. Day-to-Day Flow at POS

For cashiers:

1. **Customer approaches with items.**
2. Cashier opens the **Sell** page.
3. They tap the **camera / scan** button and point at the **label/card**.
4. The ML model:
   - Looks at the camera frame.
   - Predicts a product ID and confidence score.
5. Dukarun:
   - Uses a **local product cache** to fetch the product instantly.
   - Shows options if multiple SKUs exist (1kg, 2kg, etc.).
6. Cashier confirms (or corrects) the choice and repeats.

Result:

- Very fast, low-typing checkout.
- Works with labels printed, hand-drawn, or even displayed on a screen.

---

## Per-Channel ML Models

### 1. Model Storage

From `ARCHITECTURE.md` and the ML plugin docs:

- Models are stored per channel under:

  ```text
  assets/ml-models/{channelId}/latest/
    model.json
    weights.bin
    metadata.json
  ```

- They are served via HTTP(s) using Vendure’s asset server.

**Origin:** Dukarun-Exclusive Vendure plugin.

---

### 2. Frontend Consumption

On the frontend:

- The **ML model service**:
  - Downloads the model files once.
  - Caches them:
    - In memory (for current session).
    - In IndexedDB (for future sessions).
  - Uses TensorFlow.js to run inference inside the browser.

This allows:

- Low latency once the model is cached.
- Model usage even with intermittent internet connectivity.

---

## ML Training Pipeline & Automation

### 1. Automatic Photo Extraction

From `ML_TRAINING_SETUP.md`:

- The backend includes an **ML Training Service** that:
  - Listens for product and asset changes.
  - Automatically extracts photos tagged for training.
  - Debounces extraction jobs to avoid thrashing.
  - Uses a **dedicated microservice** (`ml-trainer`) to perform the actual model training, ensuring the main application remains responsive.

---

### 2. Manifests & External Trainers

For external ML teams or services:

- GraphQL endpoints allow you to:
  - Trigger **photo extraction**.
  - Fetch a **training manifest** – a JSON list of products and their image URLs.
  - Upload trained models back to Dukarun.

Example (conceptually):

```text
1. Call “extract photos for training” for Channel A.
2. Download manifest with image URLs and product IDs.
3. Train model externally (your infra).
4. Upload model.json, weights.bin, metadata.json via Dukarun’s GraphQL mutation.
5. Dukarun updates the channel’s active model.
```

**Origin:** Dukarun-Exclusive ML training integration.

---

## Offline-First POS Intelligence

The ML integration is tied closely to the **offline-first POS architecture** (see `frontend/ARCHITECTURE.md`):

- On dashboard initialisation:
  - Dukarun pre-fetches the product catalog into memory.
  - It loads or pre-warms the ML model from prior caching.
- During scans:
  - Product lookup happens purely in memory (O(1)).
  - If the network is down, the model and product cache still work as long as they’re already loaded.

This is particularly important in:

- Markets with unreliable connectivity.
- Mobile-first deployments where offline support is a must-have.

**Origin:** Dukarun-Exclusive.

---

## How to Use & Configure (Workflows)

### A. Preparing Products for Label-Based AI

**Who:** Merchant owner, manager.

1. Create a product as usual (e.g. “Tomatoes” or “Haircut”).
2. Make (or print) a visible **label/card** with the product name and/or price.
3. Take **multiple photos** of this label in different positions and lighting.
   - Use the product photo upload workflow.
   - Ensure photos clearly show the label/card.
4. Save.

Over time, as ML training is run, these photos become the base for your recognition model.

---

### B. Training or Retraining a Model (Operator / ML Team)

**Who:** Dukarun operator, external ML provider.

1. Use the **ML Training Status** component to monitor progress.
   - Training triggers **automatically** when photo extraction completes (if data is sufficient).
2. Monitor status:
2. Run training externally:
   - Use the manifest to download data.
   - Train a TensorFlow.js-compatible model.
3. Upload the trained model via the provided mutation.
4. Confirm via the ML Training Status UI that:
   - The channel has a model.
   - Status is “active”.

---

### C. Using ML at the POS

**Who:** Cashiers.

1. On the **Sell** screen, ensure you have a stable initial connection (so the model and catalog can load).
2. Tap the **camera / scan** button to start scanning.
3. Point the camera at a label or service card.
4. Accept or correct the system’s suggestion.
5. Repeat until all items are in the cart.

If the model is not yet trained or fails:

- Dukarun gracefully falls back to manual search and barcode scanning.

---

## Limitations & Notes

- **Training cadence:** ML models do not retrain automatically after each small catalog change by default – this is usually batched; your ops/ML team defines the cadence.
- **Model quality depends on photos:** The reliability of recognition depends heavily on the quality and consistency of label photos.
- **Per-channel isolation:** Models are per business (channel); sharing models between unrelated businesses is not automatic.

---

## Vendure vs Dukarun: What’s What

- **Vendure Core**
  - Asset management (file storage for images and models).
  - Custom field system used to attach ML metadata to channels.

- **Dukarun-Enhanced**
  - Channel-level asset selectors for ML model files and metadata.
  - POS and product creation flows aware of ML state.

- **Dukarun-Exclusive**
  - Entire ML training and automation pipeline.
  - Label-photo recognition design and UX.
  - Per-channel model storage, loading and offline caching.
  - ML Training Status UI and integration points for external ML services.
