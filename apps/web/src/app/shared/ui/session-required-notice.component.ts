import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-session-required-notice',
  imports: [RouterLink, IconComponent],
  template: `
    <div
      role="alert"
      class="alert alert-warning items-start text-sm sm:items-center"
      [class.mb-3]="!compact()"
      [class.py-2]="compact()"
    >
      <app-icon name="heroExclamationTriangle" class="mt-0.5 sm:mt-0" />
      <div class="min-w-0 flex-1">
        <p class="font-semibold">Cashier session required</p>
        <p class="text-base-content/70">Open a session before {{ action() }}.</p>
      </div>
      <a routerLink="/money/cashier" class="link shrink-0 font-semibold">Open session</a>
    </div>
  `,
})
export class SessionRequiredNoticeComponent {
  readonly action = input('recording this transaction');
  readonly compact = input(false);
}
