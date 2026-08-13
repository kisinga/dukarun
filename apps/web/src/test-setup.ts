import { vi } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  return window.setTimeout(() => callback(performance.now()), 0);
};

window.cancelAnimationFrame = (handle: number): void => window.clearTimeout(handle);
