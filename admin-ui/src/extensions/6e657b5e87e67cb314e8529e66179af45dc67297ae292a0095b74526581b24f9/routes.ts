import { Route } from '@angular/router';
import { SubscriptionTierListComponent } from './subscription-tier-list.component';
import { SubscriptionTierDetailComponent } from './subscription-tier-detail.component';

export const subscriptionTierRoutes: Route[] = [
  {
    path: '',
    component: SubscriptionTierListComponent,
    data: {
      breadcrumb: 'Subscription Tiers',
    },
  },
  {
    path: 'create',
    component: SubscriptionTierDetailComponent,
    data: {
      breadcrumb: 'Create Subscription Tier',
    },
  },
  {
    path: ':id',
    component: SubscriptionTierDetailComponent,
    data: {
      breadcrumb: 'Edit Subscription Tier',
    },
  },
];

