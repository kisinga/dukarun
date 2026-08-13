import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrintService } from './print.service';

describe('PrintService', () => {
  afterEach(() => {
    document.getElementById('print-frame')?.remove();
  });

  it('prints through an isolated document and blocks overlapping preparation', async () => {
    const service = new PrintService();
    const firstPrint = service.printDocument(
      'Statement <Amina>',
      '<main class="print-template">Statement body</main>',
      '.print-template { color: black; }'
    );
    const overlappingPrint = service.printDocument('Second document', '<main>Second</main>', '');

    await expect(overlappingPrint).rejects.toThrow('already being prepared');

    const frame = document.getElementById('print-frame') as HTMLIFrameElement;
    const print = vi.fn();
    const focus = vi.fn();
    Object.defineProperty(frame.contentWindow, 'print', { configurable: true, value: print });
    Object.defineProperty(frame.contentWindow, 'focus', { configurable: true, value: focus });

    await firstPrint;

    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.contentDocument?.title).toBe('Statement <Amina>');
    expect(frame.contentDocument?.body.textContent).toContain('Statement body');
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
  });
});
