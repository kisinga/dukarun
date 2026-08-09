export const BRAND = {
  fontFamily: "'Outfit', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  colors: {
    base100: '#fafafa',
    base200: '#ebebeb',
    base300: '#dedede',
    content: '#2b2b2f',
    primary: '#e85d2f',
    primaryContent: '#ffffff',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    info: '#3b82f6',
  },
  radius: {
    selector: 6,
    field: 8,
    box: 12,
  },
  shadow: '0 1px 2px rgb(0 0 0 / 4%), 0 2px 8px -2px rgb(0 0 0 / 6%)',
} as const;

export const FORMAT_CONFIG = {
  wide: { width: 1920, height: 1080, safeX: 120, safeY: 72 },
  vertical: { width: 1080, height: 1920, safeX: 72, safeY: 180 },
  square: { width: 1080, height: 1080, safeX: 72, safeY: 80 },
} as const;
