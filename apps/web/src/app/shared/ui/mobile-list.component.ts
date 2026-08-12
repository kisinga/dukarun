import { Component, input } from '@angular/core';

/** Standard phone data surface: one bordered list with compact divided rows. */
@Component({
  selector: 'app-mobile-list',
  host: { class: 'mobile-list block' },
  template: `
    <div
      class="overflow-hidden rounded-box border border-base-300/70 bg-base-100 shadow-card"
      [class.lg:hidden]="!desktopVisible()"
    >
      <ng-content />
    </div>
  `,
})
export class MobileListComponent {
  /** Standalone activity/recovery lists can keep the same surface on desktop. */
  readonly desktopVisible = input(false);
}
