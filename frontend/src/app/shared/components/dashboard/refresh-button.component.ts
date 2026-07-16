import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * The one refresh control for the whole app — a round, bordered icon button that
 * spins its icon *in place* while loading (same element, no size jump, no layout
 * shift). Used directly by `app-page-header`; drop it anywhere a page needs a
 * refresh outside a header. `heroArrowPath` is registered globally in APP_ICONS.
 */
@Component({
  selector: 'app-refresh-button',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      (click)="refresh.emit()"
      [disabled]="isLoading()"
      class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-base-300 bg-base-100 text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content disabled:opacity-60"
      [attr.title]="title()"
      [attr.aria-label]="title()"
    >
      <ng-icon name="heroArrowPath" size="1.125rem" [class.animate-spin]="isLoading()" />
    </button>
  `,
})
export class RefreshButtonComponent {
  readonly isLoading = input(false);
  readonly title = input('Refresh');
  readonly refresh = output<void>();
}
