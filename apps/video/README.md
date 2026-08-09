# Dukarun video pipeline

This workspace produces a pragmatic-replica product walkthrough without screen recordings. The pilot contains one 60-second offline POS walkthrough and three 15-second cutdowns, each in 16:9, 9:16, and 1:1 formats (12 MP4 deliverables).

The visual timeline is deterministic React/Remotion code. Scripts and narration are local inputs; the pipeline has no hosted AI or API-key dependency.

## Quick start

```bash
npm run dev:video
```

The Studio works from the checked-in `projects/offline-pos/script.json` and does not need an API key. The UI is a purpose-built replica—not a recording of live customer data.

To render visual regression frames for every CTA-bearing ending and aspect ratio, run `npm run validate:cta -w @dukarun/video`. The nine ignored PNGs are written to `.cache/cta-validation`.

## Asset boundaries

- `public/media/` contains local source assets used by renders. It is gitignored; restore these files from external asset storage before rendering.
- `public/generated/` contains derived narration masters and intermediates produced by the voice workflow. It is gitignored and can be regenerated or replaced.
- `output/` contains watermarked reviews and approved delivery renders. It is gitignored; publish these files to object storage or a CDN rather than Git.
- `.cache/` contains disposable visual-validation frames.
- `projects/*/approval.*.json`, `voice.json`, and `script.draft.json` are local workflow state and remain gitignored.

The checked-in manifest references assets relative to `public/`. For example, the opening recording is `media/offline-pos/audio/hook.m4a`. Keep that canonical file locally or in external asset storage—never link a render directly to Downloads.

## Review workflow

1. Edit `brief.json`, the shipped claim registry, and `script.json`. You can use a local `script.draft.json` while drafting; it stays ignored.

2. Read the draft/script and explicitly approve it. If a draft exists, approval promotes it to `script.json`.

   ```bash
   npm run video:approve-script -- --project offline-pos --approver "Your name"
   ```

3. Choose narration. Imported narration masters are normalized to broadcast-friendly AAC under `public/generated/`. Hand-reviewed segment recordings that must reproduce across checkouts belong under `public/media/<project>/audio/` and are referenced by `audioFile` in the approved script.

   ```bash
   # Your recording (path is relative to the repository root)
   npm run video:voice -- --project offline-pos --mode human --file recordings/offline-pos.wav

   # Human master with some externally generated segments
   npm run video:voice -- --project offline-pos --mode mixed --file recordings/offline-pos-mixed.wav

   # No narration
   npm run video:voice -- --project offline-pos --mode silent
   ```

   Human and mixed masters must be within three seconds of the composition duration so accidental timing drift fails before rendering. Script/audio review remains part of final approval.

4. Render watermarked review files. To test one composition first, pass `--only`; omit it to produce all 12.

   ```bash
   npm run video:render-review -- --project offline-pos --only offline-pos-full-wide
   npm run video:render-review -- --project offline-pos
   ```

5. Review the videos in `output/review/offline-pos`, then approve the exact script/audio hash and render final files.

   ```bash
   npm run video:approve-final -- --project offline-pos --approver "Your name"
   npm run video:render-final -- --project offline-pos
   ```

Final output includes MP4s, PNG thumbnails, an English SRT caption file, and `delivery-manifest.json` with SHA-256 hashes. Generated media and local approval identities are intentionally gitignored.

The renderer also emits WebVTT captions for local review. `apps/video` is development tooling and is not deployed. Production keeps `MARKETING_VIDEO_BASE_URL` unset, so the homepage adds no video markup or network requests.

## Automation boundary

Once the brief and claim registry are maintained, the machine can validate, normalize supplied voice recordings, render every aspect ratio, generate captions/thumbnails, and package/checksum the delivery. Humans remain responsible for the two explicit gates: factual/script approval and final brand/legal/audio approval. Publishing is deliberately outside this workspace.

The 15-second cutdowns are designed as readable motion-first social clips and currently ship without the 60-second master narration. That avoids mismatched audio after scenes are retimed. Bespoke cutdown voice tracks can be added as a later extension.

## Adding a project

Create `projects/<project-id>/brief.json` and `script.json`, register compositions in `src/root.tsx`, and implement any new scene template in `src/scenes.tsx`. Keep product assertions in `projects/claims.json` tied to source paths. `npm run check:video` validates types, manifests, brand-token alignment, timelines, and composition discovery.

Remotion usage may require a company licence depending on organisation size and use; confirm the current terms before commercial production.
