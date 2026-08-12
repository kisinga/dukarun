import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { ButtonComponent } from './button.component';
import { IconComponent } from './icon.component';

/**
 * Responsive page-header actions. One primary action remains visible on phones;
 * secondary actions share one overflow menu and render inline on larger screens.
 */
@Component({
  selector: 'app-page-actions',
  imports: [ButtonComponent, IconComponent],
  host: { class: 'block' },
  template: `
    <div class="page-actions flex items-center justify-end gap-2">
      <div class="page-actions-utility flex items-center gap-1">
        <ng-content select="[utilityAction]" />
      </div>

      <div class="page-actions-overflow-wrap relative">
        <button
          appButton
          variant="ghost"
          [iconOnly]="true"
          type="button"
          class="page-actions-overflow-toggle md:hidden"
          title="More page actions"
          aria-label="More page actions"
          [attr.aria-expanded]="open()"
          (click)="$event.stopPropagation(); open.set(!open())"
        >
          <app-icon name="heroEllipsisVertical" />
        </button>
        <div
          class="page-actions-overflow"
          [class.page-actions-overflow-open]="open()"
          (click)="closeAfterAction($event)"
        >
          <ng-content select="[overflowAction]" />
        </div>
      </div>

      <div class="page-actions-primary flex items-center">
        <ng-content select="[primaryAction]" />
      </div>
    </div>
  `,
})
export class PageActionsComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly open = signal(false);

  protected closeAfterAction(event: Event): void {
    if ((event.target as HTMLElement).closest('button, a')) this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }
}
