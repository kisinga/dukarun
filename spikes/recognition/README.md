# Recognition spike (Task 0)

Standalone, throwaway harness that answers the one question the design can't settle on paper:
**does cosine nearest-match actually separate your real products from real (bad) photos, and
do we need MobileCLIP or is MobileNet enough?**

It touches no app code. Delete the `spikes/` folder when the decision is made.
See `docs/ML_PRODUCT_RECOGNITION.md` §9 for why this is the gate.

## What it does

1. Loads **one dataset folder** whose subfolders are items (each holding that product's photos).
2. Splits each item's photos into an enrolment set and a held-out **test** set (default 60% enrol).
3. Embeds every image with the chosen backend(s).
4. For each test photo, finds the nearest enrolled product and measures:
   - raw top-1 accuracy (is the nearest product correct?),
   - the best decision gate (tau + top1/top2 margin) that keeps **false-accept ≤ 2%**,
   - **max-over-set vs centroid** fingerprints,
   - an auto-calibrated tau (what the real app would compute at load),
   - suspected look-alike products (lowest margin),
   - embed latency (median / p90).
4. Prints **PASS / CHECK** against the doc's gates.

## Data layout

One folder, one subfolder per item, photos inside:

```
dataset/
  coca-cola-500ml/   img1.jpg img2.jpg img3.jpg …   (8–15 varied photos)
  coca-cola-1l/      …
  bread-white/       …
```

Subfolder name = the product id (just a label here). Put **varied** photos in each item —
different lighting, angle, distance, background — because the harness holds some out to test
against the rest. An item with a single photo becomes an enrol-only distractor (kept so it can
still trigger false accepts, but not tested). Include 2–3 deliberate look-alike items
(e.g. 500ml vs 1L of one brand) — those are the hard cases.

### Stricter variant (optional)

Splitting from the same photos slightly **understates** the real enrolment↔scan gap (same
session, similar conditions). For the strongest signal, shoot a fresh session under bad
conditions later and re-run. The harness can be extended to take a separate test folder if you
want that — ask.

## Run

Must be served over HTTP (ES modules + WASM won't load from `file://`):

```bash
cd spikes/recognition
npx serve .            # or: python3 -m http.server 8080
```

Open the printed URL, pick the dataset folder, set enrol %, choose an embedder, hit **Run**.
First run downloads model weights from CDN (needs network); cached after.

### Get the latency number that matters

Median latency on a desktop is optimistic. Serve on your LAN and open the page on a **real
mid-tier Android** to get the number the budget is about:

```bash
npx serve . -l 8080            # then open http://<your-LAN-ip>:8080 on the phone
```

## Reading the result

Pass (per the design doc) needs **all** of:
- genuine top-1 accept **≥ 85%** at a gate where **false-accept ≤ 2%**,
- median embed latency within the **~100 ms / 2–4 fps** budget (measured on a phone),
- **max-over-set ≥ centroid** (if centroid ties, the simpler centroid is safe to use).

Decisions it makes for us:
- **MobileNet vs MobileCLIP-S0** — default to MobileNet; only adopt MobileCLIP if MobileNet
  can't clear the bar.
- **per-image vs centroid** fingerprints.
- whether any look-alike SKUs must be **barcode-only**.

## Notes

- `match.js` is the prototype of the real `embedding-match.ts` — same cosine / bestMatch /
  calibrateTau logic, framework-free. It carries straight into the app.
- MobileCLIP path is **experimental**. If its numbers look wrong, in `embedders.js` try
  `dtype: 'fp16'` instead of `'q8'`, or `device: 'wasm'`, or `pooling: 'cls'`.
- This is not wired to the service worker, the backend, or any custom field. That's the
  build phase, after this passes.
