import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { documentHtml, type RenderedDocument } from '@dukarun/documents';
import {
  prepareOpenEsc,
  launchOpenEsc,
  printWithSystem,
  type PreparedBrowserPrint,
} from '../../../../packages/documents/browser-print';
import {
  openEscSupported,
  OPEN_ESC_STORE_URL,
  type DevicePrintMethod,
} from '../../../../packages/documents/open-esc';

/** Script-disabled frame gives customer documents the same content and styles as printing. */
@Component({
  selector: 'app-document-view',
  host: { '(window:resize)': 'resize()' },
  template: ` @if (supported && document().print?.kind !== 'sheet') {
      <details class="mb-3 rounded-lg border border-base-300 p-3 text-sm">
        <summary>Print settings</summary>
        <label class="mt-2 block"
          >Printer on this device
          <select
            class="select w-full"
            [value]="method()"
            (change)="setMethod($any($event.target).value)"
          >
            <option value="system">System printer / PDF</option>
            <option value="open-esc">Open ESC</option>
          </select>
        </label>
        <a class="link" [href]="storeUrl" target="_blank" rel="noopener noreferrer"
          >Install Open ESC</a
        >
      </details>
    }
    @if (preparing()) {
      <p role="status" class="mb-2 text-sm">Preparing print…</p>
    }
    @if (printError()) {
      <p role="alert" class="text-error">{{ printError() }}</p>
      <div class="mb-3 flex gap-2">
        <button type="button" class="btn btn-outline" (click)="retry()">Prepare again</button>
        <button type="button" class="btn btn-outline" (click)="systemPrint()">
          Use system printer
        </button>
      </div>
    }
    <iframe
      #frame
      title="Business document"
      sandbox="allow-same-origin allow-modals"
      [srcdoc]="source()"
      (load)="resize()"
    ></iframe>`,
  styles: `
    iframe {
      display: block;
      width: 100%;
      min-height: 24rem;
      border: 0;
      background: white;
    }
  `,
})
export class DocumentViewComponent {
  readonly document = input.required<RenderedDocument>();
  private readonly sanitizer = inject(DomSanitizer);
  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');
  readonly supported = openEscSupported();
  readonly storeUrl = OPEN_ESC_STORE_URL;
  readonly method = signal<DevicePrintMethod>(this.loadMethod());
  readonly preparing = signal(false);
  readonly printError = signal<string | null>(null);
  private readonly revision = signal(0);
  private prepared: PreparedBrowserPrint | null = null;
  constructor() {
    effect(onCleanup => {
      const job = this.document();
      const method = this.method();
      this.revision();
      let active = true;
      this.prepared = null;
      this.printError.set(null);
      this.preparing.set(false);
      if (!this.supported || method !== 'open-esc' || !job.print || job.print.kind === 'sheet')
        return;
      this.preparing.set(true);
      void prepareOpenEsc(job)
        .then(prepared => {
          if (active) this.prepared = prepared;
        })
        .catch(error => {
          if (active)
            this.printError.set(
              error instanceof Error ? error.message : 'Print could not be prepared.'
            );
        })
        .finally(() => {
          if (active) this.preparing.set(false);
        });
      onCleanup(() => {
        active = false;
      });
    });
  }
  setMethod(method: string): void {
    if (method !== 'system' && method !== 'open-esc') return;
    this.method.set(method);
    try {
      localStorage.setItem('dukarun-print-method', method);
    } catch {
      /* Session choice. */
    }
  }
  retry(): void {
    this.revision.update(value => value + 1);
  }
  async systemPrint(): Promise<void> {
    try {
      await printWithSystem(this.document());
      this.printError.set(null);
    } catch (error) {
      this.printError.set(error instanceof Error ? error.message : 'Printing failed.');
    }
  }
  private loadMethod(): DevicePrintMethod {
    try {
      return localStorage.getItem('dukarun-print-method') === 'open-esc' ? 'open-esc' : 'system';
    } catch {
      return 'system';
    }
  }
  readonly source = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(documentHtml(this.document()))
  );
  resize(): void {
    const frame = this.frame().nativeElement;
    const doc = frame.contentDocument;
    const content = doc?.querySelector<HTMLElement>('.document');
    if (!doc || !content) return;
    doc.documentElement.style.setProperty(
      '--document-preview-scale',
      String(Math.min(1, frame.clientWidth / content.scrollWidth))
    );
    frame.style.height = `${doc.body.scrollHeight + 24}px`;
  }
  async print(): Promise<void> {
    if (
      this.supported &&
      this.method() === 'open-esc' &&
      this.document().print &&
      this.document().print?.kind !== 'sheet'
    ) {
      if (!this.prepared)
        throw new Error(this.printError() ?? 'Print is preparing. Try again when ready.');
      try {
        launchOpenEsc(this.prepared);
      } catch (error) {
        this.printError.set(error instanceof Error ? error.message : 'Open ESC could not start.');
        throw error;
      }
      return;
    }
    const frame = this.frame().nativeElement;
    const win = frame.contentWindow;
    if (!win) throw new Error('The document is not ready. Try again.');
    if (win.document.readyState !== 'complete')
      await new Promise<void>(resolve => {
        frame.addEventListener('load', () => resolve(), { once: true });
        setTimeout(resolve, 2000);
      });
    await Promise.race([
      Promise.all([
        win.document.fonts?.ready,
        ...Array.from(win.document.images)
          .filter(i => !i.complete)
          .map(
            i =>
              new Promise<void>(resolve => {
                i.addEventListener('load', () => resolve(), { once: true });
                i.addEventListener('error', () => resolve(), { once: true });
              })
          ),
      ]),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
    win.focus();
    win.print();
  }
}
