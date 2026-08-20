import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import {
  PlatformSalesCommission,
  PlatformSalesSnapshot,
  PlatformSalesperson,
  PlatformService,
} from '../../core/platform.service';
import { MoneyComponent } from '../../shared/ui/money.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

@Component({
  selector: 'app-platform-sales',
  imports: [ReactiveFormsModule, MoneyComponent, PageHeaderComponent],
  template: `
    <app-page-header title="Sales" subtitle="Invitation attribution and first-purchase commissions">
      <button actions class="btn btn-ghost btn-sm" [disabled]="loading()" (click)="load()">
        {{ loading() ? 'Refreshing…' : 'Refresh' }}
      </button>
    </app-page-header>

    @if (error()) {
      <div class="alert alert-error mb-4">
        <span>{{ error() }}</span>
      </div>
    }
    @if (notice()) {
      <div class="alert alert-success mb-4">
        <span>{{ notice() }}</span>
      </div>
    }

    @if (snapshot(); as data) {
      <section class="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <article class="stat rounded-box bg-base-100 p-4">
          <div class="stat-title">Registrations</div>
          <div class="stat-value text-2xl">{{ data.totals.registrations }}</div>
        </article>
        <article class="stat rounded-box bg-base-100 p-4">
          <div class="stat-title">Approved</div>
          <div class="stat-value text-2xl">{{ data.totals.approvals }}</div>
        </article>
        <article class="stat rounded-box bg-base-100 p-4">
          <div class="stat-title">First payments</div>
          <div class="stat-value text-2xl">{{ data.totals.first_payments }}</div>
        </article>
        <article class="stat rounded-box bg-base-100 p-4">
          <div class="stat-title">First-payment revenue</div>
          <div class="stat-value text-2xl">
            <app-money [amount]="data.totals.first_payment_revenue" />
          </div>
        </article>
        <article class="stat rounded-box bg-base-100 p-4">
          <div class="stat-title">Pending commission</div>
          <div class="stat-value text-2xl">
            <app-money [amount]="data.totals.pending_commission" />
          </div>
        </article>
        <article class="stat rounded-box bg-base-100 p-4">
          <div class="stat-title">Paid commission</div>
          <div class="stat-value text-2xl">
            <app-money [amount]="data.totals.paid_commission" />
          </div>
        </article>
      </section>

      <section class="card mb-4 bg-base-100">
        <form class="card-body gap-4 p-4" (submit)="$event.preventDefault(); saveSettings()">
          <div>
            <h2 class="section-title">Commission policy</h2>
            <p class="type-caption mt-1">One percentage applied to verified initial purchases.</p>
          </div>
          <div class="flex flex-wrap items-end gap-4">
            <label class="form-control w-40">
              <span class="label-text mb-1">Commission rate</span>
              <label class="input input-bordered flex items-center gap-2">
                <input
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  class="w-full"
                  [formControl]="rate"
                />
                <span>%</span>
              </label>
            </label>
            <label class="flex min-h-11 items-center gap-3 rounded-field bg-base-200 px-3">
              <input type="checkbox" class="toggle toggle-primary" [formControl]="enabled" />
              <span class="text-sm font-medium">Accrual enabled</span>
            </label>
            <button class="btn btn-primary" type="submit" [disabled]="busy()">Save policy</button>
          </div>
        </form>
      </section>

      <section class="card mb-4 bg-base-100">
        <form class="card-body gap-4 p-4" (submit)="$event.preventDefault(); createSalesperson()">
          <div>
            <h2 class="section-title">Add salesperson</h2>
            <p class="type-caption mt-1">
              Codes are permanent; deactivate a salesperson to stop new attribution.
            </p>
          </div>
          <div class="grid gap-3 md:grid-cols-4">
            <label class="form-control">
              <span class="label-text mb-1">Name</span>
              <input class="input input-bordered" [formControl]="name" />
            </label>
            <label class="form-control">
              <span class="label-text mb-1">Phone (optional)</span>
              <input class="input input-bordered" type="tel" [formControl]="phone" />
            </label>
            <label class="form-control">
              <span class="label-text mb-1">Invitation code</span>
              <input class="input input-bordered uppercase" maxlength="24" [formControl]="code" />
            </label>
            <button class="btn btn-primary self-end" type="submit" [disabled]="busy()">
              Create
            </button>
          </div>
        </form>
      </section>

      <section class="card mb-4 overflow-hidden bg-base-100">
        <div class="border-b border-base-300 p-4"><h2 class="section-title">Salespeople</h2></div>
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Salesperson</th>
                <th>Funnel</th>
                <th>Revenue</th>
                <th>Commission</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (person of data.salespeople; track person.id) {
                <tr>
                  <td>
                    <p class="font-semibold">{{ person.name }}</p>
                    <button class="link link-primary font-mono text-xs" (click)="copyLink(person)">
                      {{ person.invitation_code }}
                    </button>
                    @if (!person.active) {
                      <span class="badge badge-ghost ml-2">inactive</span>
                    }
                  </td>
                  <td class="text-sm">
                    {{ person.registrations }} registered · {{ person.approvals }} approved ·
                    {{ person.first_payments }} paid
                  </td>
                  <td>
                    <app-money [amount]="person.first_payment_revenue" [showCurrency]="true" />
                  </td>
                  <td class="text-sm">
                    <app-money [amount]="person.pending_commission" /> pending ·
                    <app-money [amount]="person.paid_commission" /> paid
                  </td>
                  <td class="text-right">
                    <button
                      class="btn btn-ghost btn-sm"
                      [disabled]="busy()"
                      (click)="toggle(person)"
                    >
                      {{ person.active ? 'Deactivate' : 'Activate' }}
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="py-10 text-center text-base-content/60">
                    No salespeople yet.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card overflow-hidden bg-base-100">
        <div class="border-b border-base-300 p-4">
          <h2 class="section-title">Commission review</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Salesperson</th>
                <th>Collected</th>
                <th>Commission</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (commission of data.commissions; track commission.id) {
                <tr>
                  <td>
                    <p class="font-semibold">{{ commission.company_name }}</p>
                    <p class="type-caption">{{ commission.payment_reference }}</p>
                  </td>
                  <td>{{ commission.salesperson_name }}</td>
                  <td>
                    <app-money [amount]="commission.collected_amount" [showCurrency]="true" />
                  </td>
                  <td>
                    <app-money [amount]="commission.commission_amount" [showCurrency]="true" /><span
                      class="type-caption ml-1"
                      >{{ commission.rate_bps / 100 }}%</span
                    >
                  </td>
                  <td>
                    <span
                      class="badge"
                      [class.badge-warning]="commission.status === 'pending'"
                      [class.badge-info]="commission.status === 'approved'"
                      [class.badge-success]="commission.status === 'paid'"
                      [class.badge-ghost]="commission.status === 'reversed'"
                      >{{ commission.status }}</span
                    >
                  </td>
                  <td class="text-right">
                    @if (commission.status === 'pending') {
                      <button
                        class="btn btn-primary btn-sm mr-1"
                        [disabled]="busy()"
                        (click)="review(commission, 'approved')"
                      >
                        Approve
                      </button>
                    }
                    @if (commission.status === 'approved') {
                      <button
                        class="btn btn-success btn-sm mr-1"
                        [disabled]="busy()"
                        (click)="review(commission, 'paid')"
                      >
                        Mark paid
                      </button>
                    }
                    @if (commission.status === 'pending' || commission.status === 'approved') {
                      <button
                        class="btn btn-ghost btn-sm text-error"
                        [disabled]="busy()"
                        (click)="review(commission, 'reversed')"
                      >
                        Reverse
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="py-10 text-center text-base-content/60">
                    No commissions to review.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (data.commission_total > commissionPageSize) {
          <div class="flex items-center justify-between border-t border-base-300 p-4 text-sm">
            <span
              >{{ commissionOffset() + 1 }}–{{ commissionPageEnd() }} of
              {{ data.commission_total }}</span
            >
            <div class="join">
              <button
                class="btn btn-sm join-item"
                [disabled]="loading() || commissionOffset() === 0"
                (click)="changeCommissionPage(-1)"
              >
                Previous
              </button>
              <button
                class="btn btn-sm join-item"
                [disabled]="loading() || commissionPageEnd() >= data.commission_total"
                (click)="changeCommissionPage(1)"
              >
                Next
              </button>
            </div>
          </div>
        }
      </section>
    }
  `,
})
export class SalesComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  protected readonly snapshot = signal<PlatformSalesSnapshot | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly commissionOffset = signal(0);
  protected readonly commissionPageSize = 100;
  protected readonly enabled = new FormControl(false, { nonNullable: true });
  protected readonly rate = new FormControl(20, { nonNullable: true });
  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly phone = new FormControl('', { nonNullable: true });
  protected readonly code = new FormControl('', { nonNullable: true });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const snapshot = await this.platform.salesSnapshot(
        this.commissionOffset(),
        this.commissionPageSize
      );
      this.snapshot.set(snapshot);
      this.enabled.setValue(snapshot.settings.enabled);
      this.rate.setValue(snapshot.settings.rate_bps / 100);
    } catch (error) {
      this.fail(error, 'Failed to load sales');
    } finally {
      this.loading.set(false);
    }
  }

  protected async saveSettings(): Promise<void> {
    const rateBps = Math.round(this.rate.value * 100);
    if (rateBps < 1 || rateBps > 10000) return this.error.set('Enter a rate from 0.01% to 100%');
    await this.run(async () => {
      await this.platform.updateSalesCommissionSettings(this.enabled.value, rateBps);
      this.notice.set('Commission policy updated');
      await this.load();
    }, 'Failed to save commission policy');
  }

  protected async createSalesperson(): Promise<void> {
    if (!this.name.value.trim()) return this.error.set('Enter the salesperson name');
    await this.run(async () => {
      await this.platform.createSalesperson(
        this.name.value,
        this.phone.value,
        this.code.value.toUpperCase()
      );
      this.name.setValue('');
      this.phone.setValue('');
      this.code.setValue('');
      this.notice.set('Salesperson created');
      await this.load();
    }, 'Failed to create salesperson');
  }

  protected async toggle(person: PlatformSalesperson): Promise<void> {
    await this.run(async () => {
      await this.platform.setSalespersonActive(person.id, !person.active);
      this.notice.set(`${person.name} ${person.active ? 'deactivated' : 'activated'}`);
      await this.load();
    }, 'Failed to update salesperson');
  }

  protected async copyLink(person: PlatformSalesperson): Promise<void> {
    await navigator.clipboard.writeText(
      `${environment.appPublicUrl}/register?sales_code=${encodeURIComponent(person.invitation_code)}`
    );
    this.notice.set('Invitation link copied');
  }

  protected async review(
    commission: PlatformSalesCommission,
    status: 'approved' | 'paid' | 'reversed'
  ): Promise<void> {
    const payout = status === 'paid' ? window.prompt('Payout reference')?.trim() : undefined;
    const reason = status === 'reversed' ? window.prompt('Reversal reason')?.trim() : undefined;
    if ((status === 'paid' && !payout) || (status === 'reversed' && !reason)) return;
    await this.run(async () => {
      await this.platform.reviewSalesCommission(commission.id, status, payout, reason);
      this.notice.set(`Commission marked ${status}`);
      await this.load();
    }, 'Failed to update commission');
  }

  protected commissionPageEnd(): number {
    return Math.min(
      this.commissionOffset() + this.commissionPageSize,
      this.snapshot()?.commission_total ?? 0
    );
  }

  protected async changeCommissionPage(direction: -1 | 1): Promise<void> {
    this.commissionOffset.update(offset =>
      Math.max(0, offset + direction * this.commissionPageSize)
    );
    await this.load();
  }

  private async run(action: () => Promise<void>, fallback: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action();
    } catch (error) {
      this.fail(error, fallback);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(error: unknown, fallback: string): void {
    this.error.set(error instanceof Error ? error.message : fallback);
  }
}
