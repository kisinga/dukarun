import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@vendure/admin-ui/core';
import { SubscriptionTierListComponent } from './subscription-tier-list.component';
import { SubscriptionTierDetailComponent } from './subscription-tier-detail.component';
import { subscriptionTierRoutes } from './routes';

@NgModule({
  imports: [
    CommonModule,
    SharedModule,
    ReactiveFormsModule,
    RouterModule.forChild(subscriptionTierRoutes),
  ],
  declarations: [SubscriptionTierListComponent, SubscriptionTierDetailComponent],
})
export class SubscriptionTierModule {}

