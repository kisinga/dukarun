import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CustomerWithCredit } from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { Approval } from './approvals.service';

type Policy = { credit_limit: number; is_credit_approved: boolean; credit_terms_days: number };

@Component({
  selector: 'app-approval-customer-context',
  imports: [RouterLink, ButtonComponent, IconComponent, MoneyComponent, StatusBadgeComponent],
  template: `
    <div class="mt-4 flex items-center justify-between gap-3">
      <div>
        <p class="section-title">Linked customer</p>
        <p class="type-caption">Current policy compared with the request</p>
      </div>
      <a
        appButton
        variant="ghost"
        size="sm"
        [routerLink]="['/customers']"
        [queryParams]="{ customer: customer().id, approval: approval().id }"
        >Open customer <app-icon name="heroChevronRight"
      /></a>
    </div>
    <div class="mt-2 rounded-box border border-base-300 p-3">
      <p class="font-semibold">{{ customerName() }}</p>
      <p class="type-caption">Current receivable balance</p>
      <p class="mt-1 font-bold"><app-money [amount]="customer().ar_balance" /></p>
    </div>
    @if (approval().status === 'pending' && policyChanged()) {
      <div role="alert" class="alert alert-warning mt-3 text-sm">
        <app-icon name="heroExclamationTriangle" />
        <div>
          <p class="font-semibold">Customer policy changed after this request</p>
          <p>
            Approval will expire instead of overwriting the newer policy. The request was made
            against a limit of <app-money [amount]="previous().credit_limit" /> and
            {{ previous().credit_terms_days }}-day terms.
          </p>
        </div>
      </div>
    }
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <section class="rounded-box bg-base-200 p-3">
        <p class="section-title">Current policy</p>
        <app-status-badge
          class="mt-2"
          size="xs"
          [type]="current().is_credit_approved ? 'success' : 'neutral'"
          [label]="current().is_credit_approved ? 'Credit approved' : 'Credit disabled'"
        />
        <dl class="mt-2 text-sm">
          <div class="flex justify-between">
            <dt>Limit</dt>
            <dd><app-money [amount]="current().credit_limit" /></dd>
          </div>
          <div class="flex justify-between">
            <dt>Terms</dt>
            <dd>{{ current().credit_terms_days }} days</dd>
          </div>
        </dl>
      </section>
      <section class="rounded-box bg-warning/10 p-3">
        <p class="section-title">Proposed policy</p>
        <app-status-badge
          class="mt-2"
          size="xs"
          [type]="proposed().is_credit_approved ? 'success' : 'neutral'"
          [label]="proposed().is_credit_approved ? 'Credit approved' : 'Credit disabled'"
        />
        <dl class="mt-2 text-sm">
          <div class="flex justify-between">
            <dt>Limit</dt>
            <dd><app-money [amount]="proposed().credit_limit" /></dd>
          </div>
          <div class="flex justify-between">
            <dt>Terms</dt>
            <dd>{{ proposed().credit_terms_days }} days</dd>
          </div>
        </dl>
      </section>
    </div>
  `,
})
export class ApprovalCustomerContextComponent {
  readonly approval = input.required<Approval>();
  readonly customer = input.required<CustomerWithCredit>();
  protected readonly metadata = computed(
    () => this.approval().metadata as { previous?: Policy; proposed?: Policy }
  );
  protected readonly current = computed<Policy>(() => ({
    credit_limit: this.customer().credit_limit,
    is_credit_approved: this.customer().is_credit_approved,
    credit_terms_days: this.customer().credit_terms_days ?? 0,
  }));
  protected readonly previous = computed<Policy>(() => this.metadata().previous ?? this.current());
  protected readonly proposed = computed<Policy>(() => this.metadata().proposed ?? this.current());
  protected readonly policyChanged = computed(() => {
    const previous = this.previous();
    const current = this.current();
    return (
      previous.credit_limit !== current.credit_limit ||
      previous.is_credit_approved !== current.is_credit_approved ||
      previous.credit_terms_days !== current.credit_terms_days
    );
  });
  protected customerName(): string {
    return [this.customer().first_name, this.customer().last_name].filter(Boolean).join(' ');
  }
}
