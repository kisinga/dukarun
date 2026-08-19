import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../../core/money';
import { PermissionsService } from '../../core/permissions.service';
import { TaxService, type LateSaleReview, type VatReport } from '../../core/tax.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-money-vat',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    ButtonComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
  ],
  template: `
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="section-title">VAT report</h2>
        <p class="type-caption mt-1">
          Gross sales, net revenue, output VAT, claimed input VAT, and credit notes.
        </p>
      </div>
      <form class="flex flex-wrap items-end gap-2" (submit)="$event.preventDefault(); load()">
        <app-form-field label="From"
          ><input type="date" class="input input-bordered input-sm" [formControl]="from"
        /></app-form-field>
        <app-form-field label="To"
          ><input type="date" class="input input-bordered input-sm" [formControl]="to"
        /></app-form-field>
        <button appButton size="sm" type="submit" [loading]="loading()">Run report</button>
      </form>
    </div>
    @if (error()) {
      <div class="alert alert-error mb-3 text-sm">
        <app-icon name="heroExclamationTriangle" /><span>{{ error() }}</span>
      </div>
    }
    @if (report(); as vat) {
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-box border border-base-300 bg-base-100 p-4">
          <p class="type-caption">Gross sales</p>
          <p class="mt-1 text-lg font-semibold">{{ fmt(vat.sales.gross) }}</p>
        </div>
        <div class="rounded-box border border-base-300 bg-base-100 p-4">
          <p class="type-caption">Net revenue</p>
          <p class="mt-1 text-lg font-semibold">{{ fmt(vat.sales.net) }}</p>
        </div>
        <div class="rounded-box border border-base-300 bg-base-100 p-4">
          <p class="type-caption">Output VAT after credit notes</p>
          <p class="mt-1 text-lg font-semibold">
            {{ fmt(vat.sales.output_vat - vat.credit_note_vat) }}
          </p>
        </div>
        <div class="rounded-box border border-primary/30 bg-primary/5 p-4">
          <p class="type-caption">Net VAT payable</p>
          <p class="mt-1 text-lg font-semibold">{{ fmt(vat.net_vat_payable) }}</p>
        </div>
      </div>
      <div class="mt-4 space-y-2 lg:hidden">
        @for (row of vat.by_category; track row.code + row.rate_bps) {
          <article class="rounded-box border border-base-300 bg-base-100 p-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-medium">{{ row.code }}</p>
                <p class="type-caption">
                  {{ treatment(row.classification) }} · {{ rate(row.rate_bps) }}
                </p>
              </div>
              <p class="font-semibold tabular-nums">{{ fmt(row.tax) }} VAT</p>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2 border-t border-base-200 pt-2 text-sm">
              <p>
                <span class="type-caption block">Gross</span
                ><span class="tabular-nums">{{ fmt(row.gross) }}</span>
              </p>
              <p class="text-right">
                <span class="type-caption block">Net</span
                ><span class="tabular-nums">{{ fmt(row.net) }}</span>
              </p>
            </div>
          </article>
        } @empty {
          <p
            class="rounded-box border border-base-300 bg-base-100 p-4 text-sm text-base-content/60"
          >
            No VAT-classified sales in this period.
          </p>
        }
        <div class="rounded-box border border-base-300 bg-base-100 p-3 text-sm">
          <div class="flex justify-between gap-3">
            <span>Input VAT claimed</span
            ><span class="font-medium tabular-nums">{{ fmt(vat.input_vat) }}</span>
          </div>
          <div class="mt-2 flex justify-between gap-3">
            <span>Credit-note VAT</span
            ><span class="font-medium tabular-nums">{{ fmt(vat.credit_note_vat) }}</span>
          </div>
        </div>
      </div>
      <div class="mt-4 hidden rounded-box border border-base-300 bg-base-100 lg:block">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Treatment</th>
              <th>Rate</th>
              <th class="text-right">Gross</th>
              <th class="text-right">Net</th>
              <th class="text-right">VAT</th>
            </tr>
          </thead>
          <tbody>
            @for (row of vat.by_category; track row.code + row.rate_bps) {
              <tr>
                <td>
                  <span class="font-medium">{{ row.code }}</span
                  ><span class="type-caption ml-2">{{ treatment(row.classification) }}</span>
                </td>
                <td>{{ rate(row.rate_bps) }}</td>
                <td class="text-right">{{ fmt(row.gross) }}</td>
                <td class="text-right">{{ fmt(row.net) }}</td>
                <td class="text-right">{{ fmt(row.tax) }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="py-8 text-center text-base-content/60">
                  No VAT-classified sales in this period.
                </td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <th colspan="3">Input VAT claimed</th>
              <th colspan="2" class="text-right">{{ fmt(vat.input_vat) }}</th>
            </tr>
            <tr>
              <th colspan="3">Credit-note VAT</th>
              <th colspan="2" class="text-right">{{ fmt(vat.credit_note_vat) }}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    }

    <section class="mt-6">
      <div class="mb-2 flex items-center justify-between">
        <div>
          <h2 class="section-title">Late offline sales</h2>
          <p class="type-caption mt-1">
            Sales whose original tax point is in a locked period must be reviewed before posting
            now.
          </p>
        </div>
        <span class="badge" [class.badge-warning]="pendingLate().length > 0"
          >{{ pendingLate().length }} pending</span
        >
      </div>
      @if (pendingLate().length === 0) {
        <app-empty-state
          icon="heroCheckCircle"
          title="No late sales to review"
          description="Known offline queues and prior-period sales are clear."
        />
      } @else {
        <div class="space-y-2">
          @for (review of pendingLate(); track review.id) {
            <article class="rounded-box border border-warning/40 bg-warning/5 p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="font-semibold">{{ review.client_ref }}</p>
                  <p class="type-caption">Occurred {{ review.occurred_at | date: 'medium' }}</p>
                </div>
                @if (canReviewLate()) {
                  <div class="flex gap-2">
                    <button
                      appButton
                      size="sm"
                      type="button"
                      [loading]="reviewing() === review.id"
                      (click)="reviewLate(review, true)"
                    >
                      Approve and post now</button
                    ><button
                      appButton
                      size="sm"
                      variant="outline"
                      type="button"
                      (click)="reviewLate(review, false)"
                    >
                      Reject
                    </button>
                  </div>
                }
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
})
export class MoneyVatComponent implements OnInit {
  private readonly tax = inject(TaxService);
  private readonly permissions = inject(PermissionsService);
  protected readonly fmt = formatKes;
  protected readonly from = new FormControl(this.monthStart(), { nonNullable: true });
  protected readonly to = new FormControl(this.today(), { nonNullable: true });
  protected readonly report = signal<VatReport | null>(null);
  protected readonly lateSales = signal<LateSaleReview[]>([]);
  protected readonly pendingLate = computed(() =>
    this.lateSales().filter(review => review.status === 'pending')
  );
  protected readonly canReviewLate = computed(
    () => this.permissions.has('ManageApprovals') && this.permissions.has('SettleOrder')
  );
  protected readonly loading = signal(false);
  protected readonly reviewing = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [report, lateSales] = await Promise.all([
        this.tax.vatReport(this.from.value, this.to.value),
        this.tax.lateSales(),
      ]);
      this.report.set(report);
      this.lateSales.set(lateSales);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not load VAT report');
    } finally {
      this.loading.set(false);
    }
  }

  protected async reviewLate(review: LateSaleReview, approve: boolean): Promise<void> {
    const reason = approve
      ? undefined
      : window.prompt('Why should this late sale be rejected?')?.trim();
    if (!approve && !reason) return;
    this.reviewing.set(review.id);
    this.error.set(null);
    try {
      await this.tax.reviewLateSale(review.id, approve, reason);
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not review late sale');
    } finally {
      this.reviewing.set(null);
    }
  }

  protected rate(bps: number): string {
    return `${bps / 100}%`;
  }
  protected treatment(value: string): string {
    return value.replaceAll('_', ' ');
  }
  private today(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  }
  private monthStart(): string {
    return `${this.today().slice(0, 8)}01`;
  }
}
