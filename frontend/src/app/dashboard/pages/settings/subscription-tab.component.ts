import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SubscriptionStatusComponent } from './components/subscription-status/subscription-status.component';
import { SubscriptionTiersComponent } from './components/subscription-tiers/subscription-tiers.component';

@Component({
  selector: 'app-subscription-tab',
  standalone: true,
  imports: [SubscriptionStatusComponent, SubscriptionTiersComponent],
  template: `<div class="space-y-6"><app-subscription-status /><app-subscription-tiers /></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionTabComponent {}
