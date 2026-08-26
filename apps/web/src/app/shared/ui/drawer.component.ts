import {
  Component,
  ElementRef,
  OnDestroy,
  afterRenderEffect,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ButtonComponent } from './button.component';
import { IconComponent } from './icon.component';

const CLOSE_MS = 150;

/**
 * Responsive record surface: bottom task sheet on phones, right drawer on larger screens.
 * Close remains two-phase so parents keep the selected record through the exit motion.
 */
@Component({
  selector: 'app-drawer',
  imports: [ButtonComponent, IconComponent],
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    @if (rendered()) {
      <div class="fixed inset-0 z-[60]">
        <button
          type="button"
          class="overlay-backdrop absolute inset-0 h-full w-full cursor-default transition-opacity duration-200 motion-reduce:transition-none"
          [class.opacity-0]="!shown()"
          aria-label="Close panel"
          (click)="requestClose()"
        ></button>

        <div
          #panel
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title()"
          tabindex="-1"
          class="task-sheet-panel"
          [class.task-sheet-panel-shown]="shown()"
        >
          <div
            class="flex min-h-14 items-center justify-between gap-3 border-b border-base-300/60 px-4 py-2.5"
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
                (click)="requestClose()"
              >
                <app-icon name="heroXMark" />
              </button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <ng-content />
          </div>

          <footer
            class="shrink-0 border-t border-base-300/70 bg-base-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6"
            [class.task-sheet-default-footer]="!hasActionFooter() && !hasFooter()"
          >
            <!-- Keep projection unconditional: hasFooter() is detected from this rendered slot. -->
            <ng-content select="[drawerFooter]" />
            @if (!hasActionFooter() && !hasFooter()) {
              <button appButton type="button" class="w-full" (click)="requestClose()">
                {{ mobileDismissLabel() }}
              </button>
            }
          </footer>

          @if (confirmDiscard()) {
            <div
              class="overlay-backdrop absolute inset-0 z-20 flex items-end p-3 md:items-center md:justify-center"
            >
              <div
                #discardDialog
                role="alertdialog"
                aria-modal="true"
                aria-label="Discard changes?"
                tabindex="-1"
                class="w-full rounded-box border border-base-300 bg-base-100 p-4 shadow-overlay md:max-w-sm"
              >
                <h3 class="section-title">Discard changes?</h3>
                <p class="mt-1 text-sm text-base-content/65">Your unsaved changes will be lost.</p>
                <div class="mt-4 flex justify-end gap-2">
                  <button appButton variant="ghost" type="button" (click)="cancelDiscard()">
                    Keep editing
                  </button>
                  <button appButton variant="error" type="button" (click)="discardAndClose()">
                    Discard
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .task-sheet-panel {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      display: flex;
      width: 100%;
      max-height: 92dvh;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid color-mix(in oklab, var(--color-base-300) 60%, transparent);
      border-bottom: 0;
      border-radius: var(--radius-box) var(--radius-box) 0 0;
      background: var(--color-base-100);
      box-shadow: var(--shadow-overlay);
      outline: none;
      transform: translateY(100%);
      transition: transform 150ms ease-in;
    }

    .task-sheet-panel-shown {
      transform: none;
      transition-duration: 200ms;
      transition-timing-function: ease-out;
    }

    @media (min-width: 768px) {
      .task-sheet-default-footer {
        display: none;
      }

      .task-sheet-panel {
        top: 0;
        bottom: 0;
        left: auto;
        max-height: none;
        max-width: 480px;
        border-top: 0;
        border-right: 0;
        border-radius: 0;
        transform: translateX(100%);
      }

      .task-sheet-panel-shown {
        transform: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .task-sheet-panel,
      .task-sheet-panel-shown {
        transition: none;
      }
    }
  `,
})
export class DrawerComponent implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly open = model<boolean>(false);
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly mobileDismissLabel = input('Done');
  readonly dirty = input(false);
  readonly hasActionFooter = input(false);
  readonly closed = output<void>();

  protected readonly rendered = signal(false);
  protected readonly shown = signal(false);
  protected readonly hasFooter = signal(false);
  protected readonly confirmDiscard = signal(false);

  private readonly panel = viewChild<string, ElementRef<HTMLElement>>('panel', {
    read: ElementRef,
  });
  private readonly discardDialog = viewChild<string, ElementRef<HTMLElement>>('discardDialog', {
    read: ElementRef,
  });
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private savedBodyOverflow: string | null = null;
  private previousFocus: HTMLElement | null = null;
  private focusedForOpening = false;
  private focusBeforeDiscard: HTMLElement | null = null;
  private focusedDiscard = false;

  constructor() {
    effect(() => {
      if (this.open()) {
        if (this.closeTimer) {
          clearTimeout(this.closeTimer);
          this.closeTimer = null;
        }
        if (!this.rendered()) {
          this.previousFocus = document.activeElement as HTMLElement | null;
          this.focusedForOpening = false;
        }
        this.rendered.set(true);
        this.lockBodyScroll();
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
            this.previousFocus?.focus({ preventScroll: true });
            this.previousFocus = null;
            this.focusedForOpening = false;
            this.closed.emit();
          },
          reduced ? 0 : CLOSE_MS
        );
      }
    });

    afterRenderEffect(() => {
      this.hasFooter.set(!!this.host.nativeElement.querySelector('[drawerFooter]'));
      if (this.confirmDiscard()) {
        if (!this.focusedDiscard) {
          this.focusedDiscard = true;
          const dialog = this.discardDialog()?.nativeElement;
          (dialog?.querySelector<HTMLElement>('button') ?? dialog)?.focus({ preventScroll: true });
        }
        return;
      }
      this.focusedDiscard = false;
      if (this.shown() && !this.focusedForOpening) {
        this.focusedForOpening = true;
        this.panel()?.nativeElement.focus({ preventScroll: true });
      }
    });
  }

  requestClose(): void {
    if (this.dirty()) {
      this.showDiscardConfirmation();
      return;
    }
    this.close();
  }

  protected discardAndClose(): void {
    this.confirmDiscard.set(false);
    this.focusBeforeDiscard = null;
    this.close();
  }

  protected cancelDiscard(): void {
    this.confirmDiscard.set(false);
    this.focusedDiscard = false;
    const target = this.focusBeforeDiscard;
    this.focusBeforeDiscard = null;
    requestAnimationFrame(() => {
      if (target?.isConnected) target.focus({ preventScroll: true });
      else this.panel()?.nativeElement.focus({ preventScroll: true });
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.open()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.confirmDiscard()) this.cancelDiscard();
      else this.requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = this.focusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      (this.confirmDiscard()
        ? this.discardDialog()?.nativeElement
        : this.panel()?.nativeElement
      )?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  ngOnDestroy(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.unlockBodyScroll();
  }

  private close(): void {
    this.open.set(false);
  }

  private focusableElements(): HTMLElement[] {
    const root = this.confirmDiscard()
      ? this.discardDialog()?.nativeElement
      : this.panel()?.nativeElement;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(element => element.offsetParent !== null);
  }

  private showDiscardConfirmation(): void {
    if (!this.confirmDiscard()) {
      this.focusBeforeDiscard = document.activeElement as HTMLElement | null;
      this.focusedDiscard = false;
      this.confirmDiscard.set(true);
    }
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
