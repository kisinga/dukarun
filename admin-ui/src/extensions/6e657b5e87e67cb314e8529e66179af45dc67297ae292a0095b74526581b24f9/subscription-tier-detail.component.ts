import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService, NotificationService } from '@vendure/admin-ui/core';
import {
  GET_SUBSCRIPTION_TIER,
  CREATE_SUBSCRIPTION_TIER,
  UPDATE_SUBSCRIPTION_TIER,
} from './graphql';

@Component({
  selector: 'vdr-subscription-tier-detail',
  templateUrl: './subscription-tier-detail.component.html',
})
export class SubscriptionTierDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  tierId: string | null = null;

  constructor(
    private formBuilder: FormBuilder,
    private dataService: DataService,
    private route: ActivatedRoute,
    private router: Router,
    private notificationService: NotificationService
  ) {
    this.form = this.formBuilder.group({
      code: ['', Validators.required],
      name: ['', Validators.required],
      description: [''],
      priceMonthly: [0, [Validators.required, Validators.min(0)]],
      priceYearly: [0, [Validators.required, Validators.min(0)]],
      features: ['{"features": []}'],
      isActive: [true],
    });
  }

  ngOnInit() {
    this.tierId = this.route.snapshot.paramMap.get('id');
    this.isNew = !this.tierId || this.tierId === 'create';

    if (!this.isNew && this.tierId) {
      this.dataService
        .query(GET_SUBSCRIPTION_TIER, { id: this.tierId })
        .mapStream((data: any) => data.getSubscriptionTier)
        .subscribe((tier: any) => {
          if (tier) {
            this.form.patchValue({
              code: tier.code,
              name: tier.name,
              description: tier.description || '',
              priceMonthly: tier.priceMonthly,
              priceYearly: tier.priceYearly,
              features: JSON.stringify(tier.features || { features: [] }, null, 2),
              isActive: tier.isActive,
            });
          }
        });
    }
  }

  save() {
    if (this.form.invalid) {
      return;
    }

    const formValue = this.form.value;
    let features;
    try {
      features = JSON.parse(formValue.features || '{"features": []}');
    } catch (e) {
      this.notificationService.error('Invalid JSON in features field');
      return;
    }

    const input = {
      code: formValue.code,
      name: formValue.name,
      description: formValue.description || null,
      priceMonthly: parseInt(formValue.priceMonthly, 10),
      priceYearly: parseInt(formValue.priceYearly, 10),
      features: features,
      isActive: formValue.isActive,
    };

    if (this.isNew) {
      this.dataService.mutate(CREATE_SUBSCRIPTION_TIER, { input }).subscribe({
        next: () => {
          this.notificationService.success('Subscription tier created');
          this.router.navigate(['../'], { relativeTo: this.route });
        },
        error: (err) => {
          this.notificationService.error('Failed to create subscription tier');
        },
      });
    } else if (this.tierId) {
      this.dataService.mutate(UPDATE_SUBSCRIPTION_TIER, { input: { ...input, id: this.tierId } }).subscribe({
        next: () => {
          this.notificationService.success('Subscription tier updated');
          this.router.navigate(['../'], { relativeTo: this.route });
        },
        error: (err) => {
          this.notificationService.error('Failed to update subscription tier');
        },
      });
    }
  }

  cancel() {
    this.router.navigate(['../'], { relativeTo: this.route });
  }
}

