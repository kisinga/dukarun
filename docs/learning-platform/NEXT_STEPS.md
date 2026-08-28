# Learning platform next steps

This plan publishes Dukarun Guide in GitBook, then proves the real-app video approach with one task
before the remaining guides are produced.

## 1. Publish and verify Dukarun Guide

1. Import or sync `gitbook-import` to the public GitBook space.
2. Check every page in GitBook at desktop and mobile widths.
3. Confirm search finds task names and glossary terms using common wording such as "pay supplier",
   "customer owes me", "scan barcode", and "profit".
4. Confirm Search question suggestions open Assistant instead of stopping on an inert result.
5. Confirm every task article and journey displays the temporary Dukarun video as a playable embed.
6. Set GitBook external links to open in the same tab, then verify every article CTA reaches its
   matching `/learn/<content-key>` route.
7. Open exact topic and journey URLs inside Dukarun and verify their launch actions start the same
   interactive content without leaving the current tab. Repeat this on `npm run dev:web:https` to
   test against localhost.
8. Verify every Dukarun button and field name against the current application.
9. Keep each placeholder until its task-specific YouTube upload is approved and embedded.

Exit condition: all pages are public, searchable, correctly linked, and understandable without an
interactive guide or video.

## 2. Prove the capture workflow

Use **Creating a product** as the pilot.

1. Prepare one deterministic test company with fictional products, suppliers, customers, and money
   values.
2. Extend the existing Playwright harness to automate the real task using stable
   `data-learning-anchor` selectors.
3. Record separate wide, vertical, and square browser sessions. Do not crop the wide recording into
   the other formats.
4. Capture each focused element's live DOM bounds and timestamp when an added focus treatment is
   required.
5. Keep the raw recordings and capture metadata outside the application build.

Exit condition: the same repeatable run produces three recordings that show the real navigation,
responsive product editor, variant step, save action, and saved product.

## 3. Build the Remotion pilot

1. Use the recordings as full-frame footage.
2. Remove waiting time and failed attempts without hiding meaningful state changes.
3. Add narration, captions, privacy treatment, and only the minimum necessary focus treatment.
4. Derive any focus ring from captured DOM bounds, transformed with the footage crop and scale.
5. End on the saved product and point to the next useful task.

Exit condition: [the guide video baseline](../../apps/video/GUIDE_DESIGN_LANGUAGE.md) passes in all
three formats, including mobile navigation, light mode, caption clearance, and control alignment.

## 4. Review and publish the pilot

1. Review the pilot beside the current Dukarun screens, not from memory.
2. Check factual accuracy, privacy, caption timing, transcript quality, and audio clarity.
3. Upload the approved video to YouTube with captions and a useful title and description.
4. Embed that same upload in the GitBook article and reference it from the matching Usertour flow.
5. Test the public article, embedded Dukarun Guide, and interactive guide before announcing the
   video.

Exit condition: one approved upload works everywhere without an application deployment.

## 5. Scale in business order

Produce the remaining core guides only after the pilot is approved:

1. Create a supplier.
2. Record a credit purchase.
3. Complete a cash sale.
4. Create a customer and set credit.
5. Complete a credit sale.
6. Review the financial result.

Then produce barcode generation, barcode scanning, customer payments, and supplier payments. Reuse
the capture harness and Remotion composition system, but record every task and viewport from the real
application.

## Merge boundaries

- Documentation publication does not wait for videos.
- Do not add another capture or editing dependency until the pilot proves that Playwright and
  Remotion leave a specific gap.
- Video capture tooling must not add article copy or another knowledge store.
- Usertour owns interactive steps and progress. GitBook owns written explanations and video embeds.
- Do not merge a reconstructed Dukarun interface as learning-video footage.
- Keep generated recordings, screenshots, and final media out of Git unless a repository policy
  explicitly requires them.
