# Dukarun video pipeline

This workspace produces pragmatic-replica product videos without screen recordings. The primary production is an 87-second Dukarun overview. Three focused 20-second showcases cover sale records, credit and customer communication, and stock decisions. Every video supports 16:9, 9:16, and 1:1.

The visual timeline is deterministic React/Remotion code. Scripts and narration are local inputs; the pipeline has no hosted AI or API-key dependency.

## Quick start

```bash
npm run dev:video
```

The Studio loads all checked-in projects and does not need an API key. Start with `product-overview-full-wide`; the UI is a purpose-built replica using fictional shop data.

The active projects are:

- `product-overview`: the homepage introduction.
- `sale-records`: product selection, payment, record updates, and offline synchronization.
- `credit-communications`: customer and supplier balances, payment history, SMS, and WhatsApp reminders.
- `stock-decisions`: margin, stock attention, purchases, adjustments, and location transfers.

To render visual regression frames for every CTA-bearing ending and aspect ratio, run `npm run validate:cta -w @dukarun/video`. The ignored PNGs are written to `.cache/cta-validation`.

Run `npm run validate:showcases -w @dukarun/video` to render representative frames from every feature showcase and aspect ratio. These ignored PNGs are written to `.cache/showcase-validation`.

## Asset boundaries

- `public/media/` contains local source assets used by renders. It is gitignored; restore these files from external asset storage before rendering.
- `public/generated/` contains derived narration masters and intermediates produced by the voice workflow. It is gitignored and can be regenerated or replaced.
- `output/` contains watermarked reviews and approved delivery renders. It is gitignored. The site deployment publishes the approved overview assets to persistent storage on the existing public-site host.
- `.cache/` contains disposable visual-validation frames.
- `projects/*/approval.*.json`, `voice.json`, and `script.draft.json` are local workflow state and remain gitignored.

Manifest audio references are relative to `public/`. Keep canonical recordings locally or in external asset storage. Never link a render directly to Downloads.

## Review workflow

1. Edit `brief.json`, the shipped claim registry, and `script.json`. You can use a local `script.draft.json` while drafting; it stays ignored.

2. Read the draft/script and explicitly approve it. If a draft exists, approval promotes it to `script.json`.

   ```bash
   npm run video:approve-script -- --project product-overview --approver "Your name"
   ```

3. Choose narration. Imported narration masters are normalized to broadcast-friendly AAC under `public/generated/`. Hand-reviewed segment recordings that must reproduce across checkouts belong under `public/media/<project>/audio/` and are referenced by `audioFile` in the approved script.

   ```bash
   # Your recording (path is relative to the repository root)
   npm run video:voice -- --project product-overview --mode human --file recordings/product-overview.wav

   # Human master with some externally generated segments
   npm run video:voice -- --project product-overview --mode mixed --file recordings/product-overview-mixed.wav

   # No narration
   npm run video:voice -- --project product-overview --mode silent
   ```

   Human and mixed masters must be within three seconds of the composition duration so accidental timing drift fails before rendering. Script/audio review remains part of final approval.

4. Render watermarked review files. To test one composition first, pass `--only`; omit it to produce all formats configured for the project.

   ```bash
   npm run video:render-review -- --project product-overview --only product-overview-full-wide
   npm run video:render-review -- --project product-overview
   ```

5. Review the videos in `output/review/product-overview`, then approve the exact script/audio hash and render final files.

   ```bash
   npm run video:approve-final -- --project product-overview --approver "Your name"
   npm run video:render-final -- --project product-overview
   ```

Final output includes MP4s, PNG thumbnails, an English SRT caption file, and `delivery-manifest.json` with SHA-256 hashes. Generated media and local approval identities are intentionally gitignored.

The renderer also emits WebVTT captions. `apps/video` is development tooling and is not included in the application image. `scripts/deploy-apps.sh site` uploads the approved wide and square overview assets plus captions to persistent host storage, mounts them at `/media/video`, and builds the homepage against the same-origin public URL. The homepage uses square below 640 px and wide at larger sizes.

## Automation boundary

Once the brief and claim registry are maintained, the machine can validate, normalize supplied voice recordings, render every aspect ratio, generate captions/thumbnails, and package/checksum the delivery. Humans remain responsible for the two explicit gates: factual/script approval and final brand/legal/audio approval. The approved overview is published with the site deployment.

The overview remains the homepage introduction. The focused showcases are separate marketing assets and are not embedded until their scripts, visuals, and audio are approved.

## Adding a project

Create `projects/<project-id>/brief.json` and `script.json`, register the manifest in `src/root.tsx`, and implement any new scene template in `src/scenes.tsx`. Keep product assertions in `projects/claims.json` tied to source paths. `npm run check:video` validates types, manifests, brand-token alignment, and composition discovery.

Remotion usage may require a company licence depending on organisation size and use; confirm the current terms before commercial production.
