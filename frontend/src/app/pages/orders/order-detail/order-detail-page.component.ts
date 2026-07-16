import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OrderDetailComponent } from '@dukarun/order/components';

/**
 * Order detail route page.
 *
 * Thin wrapper: the detail view itself is a domain-owned shared component
 * (@dukarun/order/components) because it is also embedded by other features
 * (e.g. payments). In page mode it reads the order id from the route params.
 */
@Component({
  selector: 'app-order-detail-page',
  imports: [OrderDetailComponent],
  template: '<app-order-detail />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailPageComponent {}
