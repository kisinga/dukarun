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
import { ButtonComponent } from './button.component';
import { IconComponent } from './icon.component';

/** Exit duration (ms) — keep in sync with the `duration-150` close transition. */
const CLOSE_MS = 150;

/**
 * Right-side slide-over drawer (The Counter — overlay pattern).
 * Shared shell for record detail (customer, supplier): sticky header with title,
 * optional `[leading]` (avatar) and `[actions]` slots, scrollable projected body.
 *
 * Motion: panel slides in (ease-out, 200ms) and out (ease-in, 150ms), backdrop fades;
 * `prefers-reduced-motion` skips the transitions entirely. Close is two-phase —
 * user close sets `open` false, the exit transition plays, then `closed` emits and
 * the parent may clear its selection (unmounting the drawer).
 */
@Component({
  selector: 'app-drawer',
  imports: [ButtonComponent, IconComponent],
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
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
        <div
          #panel
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title()"
          tabindex="-1"
          class="absolute inset-y-0 right-0 flex w-full flex-col border-l border-base-300/60 bg-base-100 shadow-overlay outline-none transition-transform sm:max-w-[480px] motion-reduce:transition-none"
          [class.duration-200]="shown()"
          [class.ease-out]="shown()"
          [class.duration-150]="!shown()"
          [class.ease-in]="!shown()"
          [class.translate-x-full]="!shown()"
        >
          <div
            class="flex items-center justify-between gap-3 border-b border-base-300/60 px-4 py-3"
          >
            <div class="flex min-w-0 items-center gap-3">
              <ng-content select="[leading]" />
              <div class="min-w-0">
                <h2 class="section-title truncate">{{ title() }}</h2>
                @if (subtitle()) {
                  <p class="type-caption mt-0.5 truncate">{{ subtitle() }}</p>
                }
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <ng-content select="[actions]" />
              <button
                appButton
                variant="ghost"
                [iconOnly]="true"
                type="button"
                title="Close"
                aria-label="Close"
                (click)="open.set(false)"
              >
                <app-icon name="heroXMark" />
              </button>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto overscroll-contain p-4">
            <ng-content />
          </div>
        </div>
      </div>
    }
  `,
})
export class DrawerComponent implements OnDestroy {
  readonly open = model<boolean>(false);
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  /** Emits after the exit transition finishes — parents clear selection here. */
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
        if (this.closeTimer) {
          clearTimeout(this.closeTimer);
          this.closeTimer = null;
        }
        this.rendered.set(true);
        this.lockBodyScroll();
        // Double rAF: paint the off-canvas state first so the slide-in transitions.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (this.open()) this.shown.set(true);
          })
        );
      } else if (this.rendered()) {
        this.shown.set(false);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.closeTimer = setTimeout(
          () => {
            this.closeTimer = null;
            this.rendered.set(false);
            this.unlockBodyScroll();
            this.closed.emit();
          },
          reduced ? 0 : CLOSE_MS
        );
      }
    });
    afterRenderEffect(() => {
      if (this.shown()) {
        this.panel()?.nativeElement.focus({ preventScroll: true });
      }
    });
  }

  protected onEscape(): void {
    if (this.open()) this.open.set(false);
  }

  ngOnDestroy(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.unlockBodyScroll();
  }

  /** No page scroll behind the panel (the mobile bottom nav is z-50; the drawer is z-60). */
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
