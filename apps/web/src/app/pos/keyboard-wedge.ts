export const SCANNER_MAX_KEY_GAP_MS = 80;
export const SCANNER_MIN_CHARACTERS = 4;

/** True when recent keystrokes look like one keyboard-wedge scanner burst. */
export function isRapidScannerBurst(
  timestamps: readonly number[],
  maxGapMs = SCANNER_MAX_KEY_GAP_MS
): boolean {
  if (timestamps.length < SCANNER_MIN_CHARACTERS) return false;
  for (let index = 1; index < timestamps.length; index++) {
    if (timestamps[index]! - timestamps[index - 1]! > maxGapMs) return false;
  }
  return true;
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
