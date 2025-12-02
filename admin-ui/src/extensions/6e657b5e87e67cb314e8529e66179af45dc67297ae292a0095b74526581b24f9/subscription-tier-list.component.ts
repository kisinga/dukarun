import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DataService, NotificationService } from '@vendure/admin-ui/core';
import { GET_SUBSCRIPTION_TIERS, DELETE_SUBSCRIPTION_TIER } from './graphql';

interface SubscriptionTier {
  id: string;
  code: string;
  name: string;
  description?: string;
  priceMonthly: number;
  priceYearly: number;
  features?: any;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'vdr-subscription-tier-list',
  templateUrl: './subscription-tier-list.component.html',
})
export class SubscriptionTierListComponent implements OnInit {
  tiers$: Observable<SubscriptionTier[]>;
  totalItems$: Observable<number>;
  currentPage = 1;
  itemsPerPage = 10;

  constructor(
    private dataService: DataService,
    private router: Router,
    private route: ActivatedRoute,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.refresh();
  }

  setPageNumber(page: number) {
    this.currentPage = page;
  }

  setItemsPerPage(itemsPerPage: number) {
    this.itemsPerPage = itemsPerPage;
    this.currentPage = 1;
  }

  formatPrice(priceInCents: number): string {
    return `KES ${(priceInCents / 100).toFixed(2)}`;
  }

  createNew() {
    this.router.navigate(['./create'], { relativeTo: this.route });
  }

  editTier(tier: SubscriptionTier) {
    this.router.navigate(['./', tier.id], { relativeTo: this.route });
  }

  deleteTier(tier: SubscriptionTier) {
    this.dataService
      .mutate(DELETE_SUBSCRIPTION_TIER, { id: tier.id })
      .subscribe({
        next: () => {
          this.notificationService.success('Subscription tier deleted');
          this.refresh();
        },
        error: (err) => {
          this.notificationService.error('Failed to delete subscription tier');
        },
      });
  }

  refresh() {
    this.tiers$ = this.dataService
      .query(GET_SUBSCRIPTION_TIERS)
      .mapStream((data: any) => data.getSubscriptionTiers || []);
    this.totalItems$ = this.tiers$.pipe(map((tiers: SubscriptionTier[]) => tiers.length));
  }
}

