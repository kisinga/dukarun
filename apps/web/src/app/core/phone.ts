/**
 * Normalize a Kenyan mobile number to E.164 (+2547XXXXXXXX / +2541XXXXXXXX).
 * Accepts: 07XXXXXXXX, 01XXXXXXXX, 7XXXXXXXX, 2547XXXXXXXX, +2547XXXXXXXX.
 * Returns null when the input is not a recognizable Kenyan mobile number.
 */
export function normalizeKenyanPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^[17]\d{8}$/.test(digits)) return `+254${digits}`;
  return null;
}
