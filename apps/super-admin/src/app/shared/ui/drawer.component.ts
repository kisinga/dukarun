import {
  Component,
  ElementRef,
  OnDestroy,
  afterRenderEffect,
  effect,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';

const CLOSE_MS = 150;

/** Canonical right-side detail surface for platform records. */
@Component({
  selector: 'app-drawer',
  imports: [NgIcon],
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    @if (rendered()) {
      <div class="fixed inset-0 z-[60]">
        <button
          type="button"
          class="absolute inset-0 h-full w-full cursor-default bg-base-content/50 transition-opacity duration-200 motion-reduce:transition-none"
          [class.opacity-0]="!shown()"
          aria-label="Close panel"
          (click)="open.set(false)"
        ></button>
        <section
          #panel
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title()"
          tabindex="-1"
          class="absolute inset-y-0 right-0 flex w-full flex-col border-l border-base-300/60 bg-base-100 shadow-overlay outline-none transition-transform sm:max-w-[520px] motion-reduce:transition-none"
          [class.duration-200]="shown()"
          [class.ease-out]="shown()"
          [class.duration-150]="!shown()"
          [class.ease-in]="!shown()"
          [class.translate-x-full]="!shown()"
        >
          <header
            class="flex min-h-[4.5rem] items-center gap-3 border-b border-base-300/60 px-5 py-3"
          >
            <div class="min-w-0 flex-1">
              <h2 class="truncate text-base font-semibold tracking-tight">{{ title() }}</h2>
              @if (subtitle()) {
                <p class="type-caption mt-0.5 truncate">{{ subtitle() }}</p>
              }
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <ng-content select="[actions]" />
              <button
                type="button"
                class="btn btn-square btn-ghost btn-sm min-h-11 min-w-11"
                title="Close"
                aria-label="Close panel"
                (click)="open.set(false)"
              >
                <ng-icon name="heroXMark" />
              </button>
            </div>
          </header>
          <div class="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
            <ng-content />
          </div>
        </section>
      </div>
    }
  `,
})
export class DrawerComponent implements OnDestroy {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly closed = output<void>();

  protected readonly rendered = signal(false);
  protected readonly shown = signal(false);
  private readonly panel = viewChild<string, ElementRef<HTMLElement>>('panel', {
    read: ElementRef,
  });
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private savedBodyOverflow: string | null = null;

  constructor() {
    effect(() => {
      if (this.open()) {
        if (this.closeTimer) clearTimeout(this.closeTimer);
        this.rendered.set(true);
        this.lockBodyScroll();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (this.open()) this.shown.set(true);
          })
        );
      } else if (this.rendered()) {
        this.shown.set(false);
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.closeTimer = setTimeout(
          () => {
            this.rendered.set(false);
            this.unlockBodyScroll();
            this.closed.emit();
          },
          reduced ? 0 : CLOSE_MS
        );
      }
    });
    afterRenderEffect(() => {
      if (this.shown()) this.panel()?.nativeElement.focus({ preventScroll: true });
    });
  }

  protected onEscape(): void {
    if (this.open()) this.open.set(false);
  }

  ngOnDestroy(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.unlockBodyScroll();
  }

  private lockBodyScroll(): void {
    if (this.savedBodyOverflow !== null) return;
    this.savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  private unlockBodyScroll(): void {
    if (this.savedBodyOverflow === null) return;
    document.body.style.overflow = this.savedBodyOverflow;
    this.savedBodyOverflow = null;
  }
}
