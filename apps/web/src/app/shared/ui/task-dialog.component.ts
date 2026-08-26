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

/** Focused, blocking work surface: full-screen on phones and a bounded dialog on desktop. */
@Component({
  selector: 'app-task-dialog',
  imports: [ButtonComponent, IconComponent],
  host: { '(document:keydown)': 'onKeydown($event)' },
  template: `
    <dialog
      #nativeDialog
      class="modal task-dialog-root"
      aria-modal="true"
      [attr.aria-label]="title()"
      (click)="onDialogClick($event)"
      (cancel)="onNativeCancel($event)"
      (close)="onNativeClose()"
    >
      @if (open()) {
        <section
          #panel
          tabindex="-1"
          class="modal-box modal-box-task task-dialog-panel"
          [class.task-dialog-panel-lg]="size() === 'lg'"
        >
          <header
            class="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-base-300/70 px-4 py-3 md:px-6"
          >
            <div class="flex min-w-0 items-center gap-3">
              <ng-content select="[leading]" />
              <div class="min-w-0">
                <h2 class="type-title truncate">{{ title() }}</h2>
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
          </header>

          @if (error()) {
            <div
              role="alert"
              class="mx-4 mt-3 flex shrink-0 items-start gap-2 rounded-field border border-error/35 bg-error/10 px-3 py-2.5 text-sm text-error md:mx-6"
            >
              <app-icon name="heroExclamationTriangle" class="mt-0.5 shrink-0" />
              <span class="min-w-0">{{ error() }}</span>
            </div>
          }

          <div class="modal-body px-4 py-1 md:px-6">
            <ng-content />
          </div>

          <footer
            class="shrink-0 border-t border-base-300/70 bg-base-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6"
          >
            <ng-content select="[taskFooter]" />
          </footer>

          @if (confirmDiscard()) {
            <div
              class="absolute inset-0 z-20 flex items-end bg-base-content/45 p-3 md:items-center md:justify-center"
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
        </section>
      }
    </dialog>
  `,
  styles: `
    .task-dialog-root {
      inset: 0;
      width: 100vw;
      max-width: none;
      height: 100dvh;
      max-height: none;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      overflow: hidden;
    }

    .task-dialog-root[open] {
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .task-dialog-root::backdrop {
      background: color-mix(in oklab, var(--color-base-content) 50%, transparent);
    }

    .task-dialog-panel {
      position: relative;
      padding: 0;
      background: var(--color-base-100);
      box-shadow: var(--shadow-overlay);
      outline: none;
    }

    @media (min-width: 768px) {
      .task-dialog-root[open] {
        align-items: center;
      }

      .task-dialog-panel {
        width: min(42rem, calc(100vw - 3rem));
        max-width: min(42rem, calc(100vw - 3rem));
        border: 1px solid color-mix(in oklab, var(--color-base-300) 70%, transparent);
        border-radius: var(--radius-box);
      }

      .task-dialog-panel-lg {
        width: min(48rem, calc(100vw - 3rem));
        max-width: min(48rem, calc(100vw - 3rem));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .task-dialog-panel {
        animation: none;
        transition: none;
      }
    }
  `,
})
export class TaskDialogComponent implements OnDestroy {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly size = input<'md' | 'lg'>('md');
  readonly dirty = input(false);
  readonly error = input<string | null>(null);
  readonly closed = output<void>();

  protected readonly confirmDiscard = signal(false);
  private readonly nativeDialog = viewChild<string, ElementRef<HTMLDialogElement>>('nativeDialog', {
    read: ElementRef,
  });
  private readonly panel = viewChild<string, ElementRef<HTMLElement>>('panel', {
    read: ElementRef,
  });
  private readonly discardDialog = viewChild<string, ElementRef<HTMLElement>>('discardDialog', {
    read: ElementRef,
  });
  private previousFocus: HTMLElement | null = null;
  private savedBodyOverflow: string | null = null;
  private focused = false;
  private focusBeforeDiscard: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.previousFocus ??= document.activeElement as HTMLElement | null;
        this.focused = false;
        this.lockBodyScroll();
      } else {
        this.unlockBodyScroll();
        const target = this.previousFocus;
        this.previousFocus = null;
        this.focused = false;
        requestAnimationFrame(() => target?.focus({ preventScroll: true }));
      }
    });
    afterRenderEffect(() => {
      const dialog = this.nativeDialog()?.nativeElement;
      if (!dialog) return;
      if (!this.open()) {
        if (dialog.open) this.closeNativeDialog(dialog);
        return;
      }
      if (!dialog.open) this.showNativeDialog(dialog);
      const target = this.confirmDiscard()
        ? this.discardDialog()?.nativeElement
        : this.panel()?.nativeElement;
      if (!target || this.focused) return;
      this.focused = true;
      (
        target.querySelector<HTMLElement>('[autofocus]') ??
        target.querySelector<HTMLElement>('input, select, textarea, button') ??
        target
      )?.focus({ preventScroll: true });
    });
  }

  requestClose(): void {
    if (this.dirty()) {
      this.focusBeforeDiscard = document.activeElement as HTMLElement | null;
      this.focused = false;
      this.confirmDiscard.set(true);
      return;
    }
    this.close();
  }

  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.nativeDialog()?.nativeElement) this.requestClose();
  }

  protected onNativeCancel(event: Event): void {
    event.preventDefault();
    this.requestClose();
  }

  protected onNativeClose(): void {
    if (this.open()) this.requestClose();
  }

  protected discardAndClose(): void {
    this.confirmDiscard.set(false);
    this.close();
  }

  protected cancelDiscard(): void {
    this.confirmDiscard.set(false);
    this.focused = true;
    const target = this.focusBeforeDiscard;
    this.focusBeforeDiscard = null;
    requestAnimationFrame(() =>
      (target?.isConnected ? target : this.panel()?.nativeElement)?.focus({ preventScroll: true })
    );
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
      this.panel()?.nativeElement.focus();
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
    this.unlockBodyScroll();
  }

  private close(): void {
    this.open.set(false);
    this.closed.emit();
  }

  private showNativeDialog(dialog: HTMLDialogElement): void {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  private closeNativeDialog(dialog: HTMLDialogElement): void {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
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
