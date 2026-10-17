import {
  Directive,
  DestroyRef,
  ElementRef,
  Injector,
  Renderer2,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { PrintJob, RenderedDocument } from '@dukarun/documents';
import type { PreparedBrowserPrint } from '../../../../../../packages/documents/browser-print';
import { PrintService } from './print.service';
import { OpenEscPrintService } from './open-esc-print.service';
import { ReceiptDataService } from './receipt-data.service';

/** Bound list prefetching without retaining jobs after their buttons leave the view. */
let running = 0;
const waiting: Array<() => void> = [];
function schedule<T>(work: () => Promise<T>, current: () => boolean): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const run = () => {
      if (!current()) {
        resolve(null);
        drain();
        return;
      }
      running++;
      work()
        .then(resolve, reject)
        .finally(() => {
          running--;
          drain();
        });
    };
    const drain = () => {
      if (running < 2) waiting.shift()?.();
    };
    waiting.push(run);
    drain();
  });
}

/** Prepares in advance; its capture listener keeps the final Android handoff inside the tap. */
@Directive({
  selector: 'button[appPrintOrder],button[appPrintDocument],button[appPreparePrint]',
  host: {
    '[attr.aria-busy]': 'preparing() || null',
    '[attr.data-print-state]': 'preparing() ? "preparing" : prepared ? "ready" : null',
  },
})
export class PreparedPrintDirective {
  readonly appPrintOrder = input<string | null>(null);
  readonly appPrintKind = input<'sale' | 'receipt' | 'proforma' | 'cashier-slip'>('sale');
  readonly appPrintDocument = input<RenderedDocument | null>(null);
  readonly appPreparePrint = input<(() => Promise<PrintJob>) | null>(null);
  readonly appPrintSheet = input(false);
  readonly appPrintRevision = input<unknown>(null);
  readonly printHandedOff = output<PrintJob>();
  protected readonly preparing = signal(false);
  protected prepared: PreparedBrowserPrint | null = null;
  private readonly printer = inject(OpenEscPrintService);
  private readonly injector = inject(Injector);
  private get print(): PrintService {
    return this.injector.get(PrintService);
  }
  private readonly element = inject<ElementRef<HTMLButtonElement>>(ElementRef).nativeElement;
  private readonly visible = signal(typeof IntersectionObserver === 'undefined');
  private readonly refresh = signal(0);
  private generation = 0;
  private lastJob: PrintJob | null = null;
  private preparationError: unknown;
  private startedAt = 0;
  private handedOff = false;

  constructor() {
    const destroy = inject(DestroyRef);
    const renderer = inject(Renderer2);
    const spinner = renderer.createElement('span');
    renderer.setAttribute(spinner, 'class', 'loading loading-spinner loading-xs');
    renderer.setAttribute(spinner, 'role', 'status');
    renderer.setAttribute(spinner, 'aria-label', 'Preparing print');
    renderer.setAttribute(spinner, 'hidden', '');
    renderer.appendChild(this.element, spinner);
    effect(() => {
      if (this.preparing()) renderer.removeAttribute(spinner, 'hidden');
      else renderer.setAttribute(spinner, 'hidden', '');
    });
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(entries =>
        this.visible.set(entries.some(entry => entry.isIntersecting))
      );
      observer.observe(this.element);
    }
    effect(onCleanup => {
      const enabled = this.printer.supported && this.printer.method() === 'open-esc';
      const visible = this.visible();
      const orderId = this.appPrintOrder();
      const kind = this.appPrintKind();
      const doc = this.appPrintDocument();
      const factory = this.appPreparePrint();
      const sheet = this.appPrintSheet();
      this.printer.profile();
      this.appPrintRevision();
      this.refresh();
      if (enabled) {
        this.print.format();
        const data = this.injector.get(ReceiptDataService);
        data.printScope?.();
        data.printRevision?.();
      }
      const generation = ++this.generation;
      this.prepared = null;
      this.lastJob = doc;
      this.preparationError = null;
      this.handedOff = false;
      this.preparing.set(false);
      if (
        !enabled ||
        !visible ||
        sheet ||
        (orderId && this.print.format() === 'a4') ||
        (!orderId && !doc && !factory) ||
        doc?.print?.kind === 'sheet'
      )
        return;
      this.preparing.set(true);
      const current = () => generation === this.generation;
      let timer: ReturnType<typeof setTimeout> | undefined;
      untracked(() => {
        void schedule(async () => {
          const job = factory
            ? await factory()
            : (doc ?? (await this.print.prepareOrder(orderId!, kind)));
          if (!current()) return null;
          this.lastJob = job;
          if (!job.print || job.print.kind === 'sheet') return null;
          return this.printer.prepare(job);
        }, current)
          .then(prepared => {
            if (!current()) return;
            this.prepared = prepared;
            this.startedAt = Date.now();
            this.preparing.set(false);
            // Financials and logos must not remain cached indefinitely on a long-open screen.
            timer = setTimeout(() => this.refresh.update(value => value + 1), 45_000);
          })
          .catch(error => {
            if (current()) {
              this.preparationError = error;
              this.preparing.set(false);
            }
          });
      });
      onCleanup(() => clearTimeout(timer));
    });
    this.element.addEventListener('click', this.onClick, true);
    destroy.onDestroy(() => {
      ++this.generation;
      observer?.disconnect();
      renderer.removeChild(this.element, spinner);
      this.element.removeEventListener('click', this.onClick, true);
    });
  }

  private readonly onClick = (event: Event) => {
    if (!this.printer.supported || this.printer.method() !== 'open-esc') return;
    if (this.appPrintSheet() || (this.appPrintOrder() && this.print.format() === 'a4')) return;
    if (this.lastJob?.print?.kind === 'sheet') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.handedOff) return;
    if (this.prepared && Date.now() - this.startedAt < 60_000) {
      try {
        this.printer.launch(this.prepared);
        this.handedOff = true;
        this.printHandedOff.emit(this.prepared.job);
        // Returning from Android allows a deliberate new copy, never an automatic retry.
        setTimeout(() => {
          this.handedOff = false;
        }, 1500);
      } catch (error) {
        this.showError(error);
      }
      return;
    }
    if (this.preparationError) this.showError(this.preparationError);
    else {
      this.element.setAttribute('title', 'Preparing print…');
      if (!this.preparing()) this.refresh.update(value => value + 1);
    }
  };
  private showError(error: unknown): void {
    const job = this.lastJob;
    this.printer.fail(
      job?.title ?? 'Print document',
      error,
      job ? () => this.print.systemPrint(job) : undefined,
      async () => {
        this.refresh.update(value => value + 1);
      }
    );
  }
}
