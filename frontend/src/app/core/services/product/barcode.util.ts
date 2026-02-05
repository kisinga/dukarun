/**
 * Barcode "ignore" value: when the user enters "0", the system treats it as
 * "no barcode" and does not validate, store, or search by it.
 */
export const BARCODE_IGNORE_VALUE = '0';

/** True if barcode should be treated as absent (empty or the special ignore value "0"). */
export function isBarcodeIgnored(value: string | undefined | null): boolean {
  const t = value?.trim();
  return !t || t === BARCODE_IGNORE_VALUE;
}

/** For API/create/update: undefined when barcode is empty or the ignore value. */
export function normalizeBarcodeForApi(value: string | undefined | null): string | undefined {
  const t = value?.trim();
  if (!t || t === BARCODE_IGNORE_VALUE) return undefined;
  return t;
}
