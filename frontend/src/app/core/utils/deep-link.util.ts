/**
 * Deep Link Utility Functions
 *
 * Utility functions for parsing and transforming query parameter values
 * into typed values (number, boolean, array, etc.)
 */

/**
 * Parse a string value to a number
 * @param value - String value to parse
 * @returns Parsed number or null if invalid
 */
export function parseNumber(value: string): number | null {
  if (!value || value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse a string value to a boolean
 * Supports: 'true', 'false', '1', '0', 'yes', 'no'
 * @param value - String value to parse
 * @returns Parsed boolean
 */
export function parseBoolean(value: string): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/**
 * Parse a string value to an array
 * @param value - String value to parse (comma-separated by default)
 * @param separator - Separator character (default: ',')
 * @returns Array of strings
 */
export function parseArray(value: string, separator: string = ','): string[] {
  if (!value || value.trim() === '') {
    return [];
  }
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Parse a comma-separated string to an array
 * Convenience function for common use case
 * @param value - Comma-separated string value
 * @returns Array of strings
 */
export function parseCommaSeparated(value: string): string[] {
  return parseArray(value, ',');
}

