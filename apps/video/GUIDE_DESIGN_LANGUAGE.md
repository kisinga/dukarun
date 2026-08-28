# Dukarun guide video baseline

Goal: make the real task feel familiar before the viewer performs it.

## Tool boundary

- The running Dukarun app supplies the interface and interactions.
- Browser automation supplies repeatable data, actions, and recordings.
- Remotion supplies cuts, pacing, captions, narration, privacy blur, and delivery formats.
- Do not rebuild Dukarun screens in Remotion or position focus rings with guessed coordinates.

## Source capture

1. Start from the matching GitBook article and its current screen labels.
2. Use a deterministic test company with clearly fictional data.
3. Record the real workflow separately at wide, vertical, and square viewports.
4. Use light mode for the full guide set unless the whole set is deliberately reissued in dark mode.
5. Keep the real navigation, responsive dialogs, field order, and success state in frame.
6. Resolve attention from real DOM anchors or the live Usertour step. Never use static percentages.

## Edit in Remotion

- Let the app fill the frame.
- Cut waiting time, but keep enough time to read each result.
- Use one focus at a time. Prefer a cursor action, native focus state, or short crop over added chrome.
- If a focus ring is still needed, use target bounds captured from the live DOM and apply the same
  crop and scale as the footage.
- Blur only incidental or sensitive details. Keep the control being taught sharp.
- Keep captions clear of navigation, form actions, and Usertour hints.
- End on the real saved result and name the next useful action.

## Language

- Use the same task name and explanation as GitBook.
- Preserve exact button and field labels from Dukarun.
- Prefer short instructions and familiar business terms.
- Explain an accounting term the first time it appears.
- Do not use em dashes.

## Pilot before scaling

Approve **Creating a product** in all three formats before producing the remaining guides. Review
four moments: starting page, product details, variant and price, and saved result.

## Approval gate

- The workflow matches the current app.
- Desktop, mobile, and square each use their real responsive layout.
- Theme, data, language, caption treatment, and audio are consistent.
- No caption or focus treatment covers the active control.
- All names, identifiers, and amounts come from the clearly fictional test company. No live business
  data appears.
- The YouTube upload, captions, transcript, GitBook embed, and Usertour reference use the approved
  version.
