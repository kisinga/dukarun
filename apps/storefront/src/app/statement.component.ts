import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CustomerStatement, StorefrontService } from './storefront.service';
import { StorefrontSeoService } from './storefront-seo.service';
import { PoweredByDukarunComponent } from './powered-by-dukarun.component';

@Component({
  selector: 'app-statement',
  imports: [PoweredByDukarunComponent],
  template: `
    <main class="min-h-screen bg-base-200 p-4 py-10 print:bg-white print:p-0">
      <div class="mx-auto max-w-xl print:max-w-none">
        @if (loading()) {
          <p class="py-16 text-center text-sm text-base-content/60">Loading statement…</p>
        } @else if (statement(); as s) {
          <section class="card bg-base-100 shadow-sm print:border-0 print:shadow-none">
            <div class="card-body p-5 sm:p-7 print:p-0">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-center gap-3">
                  @if (companyLogoUrl(s.logo_path); as logo) {
                    <img [src]="logo" alt="" class="h-12 w-12 rounded-xl object-cover" />
                  }
                  <div>
                    <h1 class="text-xl font-bold">{{ s.store_name }}</h1>
                    <p class="text-sm text-base-content/60">Customer statement</p>
                  </div>
                </div>
                <button
                  class="btn btn-outline btn-sm print:hidden"
                  type="button"
                  [disabled]="printing()"
                  (click)="printStatement()"
                >
                  @if (printing()) {
                    <span class="loading loading-spinner loading-sm"></span>
                    Preparing…
                  } @else {
                    Print
                  }
                </button>
              </div>
              @if (printError()) {
                <p class="alert alert-error mt-4 text-sm print:hidden" role="alert">
                  {{ printError() }}
                </p>
              }
              <div class="mt-6 rounded-box bg-primary/10 p-4 print:border print:border-base-300">
                <p class="text-sm">Hello {{ s.customer_first_name }}</p>
                @if (s.amount_due > 0) {
                  <p class="mt-1 text-2xl font-bold tabular-nums">{{ money(s.amount_due) }}</p>
                  <p class="text-xs text-base-content/60">Amount due</p>
                } @else if (s.downpayment_available > 0) {
                  <p class="mt-1 text-2xl font-bold tabular-nums">
                    {{ money(s.downpayment_available) }}
                  </p>
                  <p class="text-xs text-base-content/60">Downpayment available</p>
                } @else {
                  <p class="mt-1 text-2xl font-bold">Settled</p>
                  <p class="text-xs text-base-content/60">No amount due</p>
                }
              </div>
              @if (s.orders.length > 0) {
                <div class="mt-5 overflow-x-auto print:overflow-visible">
                  <h2 class="mb-2 font-semibold">Open invoices</h2>
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Sale</th>
                        <th>Due</th>
                        <th class="text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (order of s.orders; track order.code) {
                        <tr>
                          <td>{{ order.code }}</td>
                          <td>{{ date(order.due_date) }}</td>
                          <td class="text-right font-semibold">{{ money(order.balance) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
              @if (s.activities.length > 0) {
                <section class="statement-activity-screen mt-5 print:hidden">
                  <h2 class="font-semibold">Account activity</h2>
                  <ul class="mt-2 divide-y divide-base-200 rounded-box border border-base-300 px-3">
                    @for (activity of s.activities; track activity.id) {
                      <li class="flex items-center justify-between gap-3 py-3">
                        <div class="min-w-0">
                          <p class="truncate text-sm font-medium">
                            {{ activity.description || activityLabel(activity.kind) }}
                          </p>
                          <p class="text-xs text-base-content/60">
                            {{ date(activity.date) }} · {{ activity.reference }}
                          </p>
                        </div>
                        <div class="shrink-0 text-right">
                          <p
                            class="text-sm font-semibold tabular-nums"
                            [class.text-success]="activity.direction === 'payment'"
                          >
                            {{ activity.direction === 'payment' ? '−' : '+'
                            }}{{ money(activity.amount) }}
                          </p>
                          <p class="text-xs text-base-content/60 tabular-nums">
                            Balance {{ money(activity.balance ?? 0) }}
                          </p>
                        </div>
                      </li>
                    }
                  </ul>
                  @if (s.activity_has_more) {
                    <div class="mt-3 flex justify-center">
                      <button
                        class="btn btn-ghost btn-sm"
                        [disabled]="activityLoading()"
                        (click)="loadOlderActivity()"
                      >
                        @if (activityLoading()) {
                          <span class="loading loading-spinner loading-sm"></span>
                        }
                        Load older activity
                      </button>
                    </div>
                  }
                </section>
              }
              @if (printRows(s).length > 0) {
                <section class="statement-activity-print mt-5 hidden print:block">
                  <h2 class="mb-2 font-semibold">Account activity</h2>
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Reference</th>
                        <th>Description</th>
                        <th class="text-right">Debit</th>
                        <th class="text-right">Credit</th>
                        <th class="text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (activity of printRows(s); track activity.id) {
                        <tr>
                          <td>{{ date(activity.date) }}</td>
                          <td>{{ activity.reference }}</td>
                          <td>{{ activity.description || activityLabel(activity.kind) }}</td>
                          <td class="text-right">
                            {{ activityDebit(activity) > 0 ? money(activityDebit(activity)) : '—' }}
                          </td>
                          <td class="text-right">
                            {{
                              activityCredit(activity) > 0 ? money(activityCredit(activity)) : '—'
                            }}
                          </td>
                          <td class="text-right font-semibold">
                            {{ money(activity.balance ?? 0) }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </section>
              }
              @if (s.payment_instructions) {
                <div class="mt-5 rounded-box border border-base-300 p-4">
                  <h2 class="font-semibold">How to pay</h2>
                  <p class="mt-1 whitespace-pre-wrap text-sm text-base-content/70">
                    {{ s.payment_instructions }}
                  </p>
                </div>
              }
              @if (s.whatsapp_number) {
                <a
                  class="btn btn-primary mt-5 min-h-11 print:hidden"
                  [href]="waLink(s.whatsapp_number, s.store_name)"
                  target="_blank"
                  rel="noopener"
                  >Contact {{ s.store_name }}</a
                >
              }
              <p class="mt-4 text-xs text-base-content/50 print:hidden">
                Read-only statement · link expires {{ date(s.expires_at) }}
              </p>
            </div>
          </section>
        } @else {
          <section class="card bg-base-100 p-8 text-center">
            <h1 class="font-bold">Statement unavailable</h1>
            <p class="mt-2 text-sm text-base-content/60">
              This link expired or was replaced. Ask the store for a new reminder.
            </p>
          </section>
        }
        <p class="mt-6 text-center text-xs text-base-content/50 print:hidden">
          <app-powered-by-dukarun />
          <span aria-hidden="true"> · </span>
          <a [href]="legalUrl('privacy')" class="link link-hover">Privacy</a>
          <span aria-hidden="true"> · </span>
          <a [href]="legalUrl('terms')" class="link link-hover">Terms</a>
        </p>
      </div>
    </main>
  `,
  styles: `
    @page {
      size: A4 portrait;
      margin: 14mm;
    }

    @media print {
      :host {
        color: #111;
      }

      th,
      td {
        overflow-wrap: anywhere;
      }
    }
  `,
})
export class StatementComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly storefront = inject(StorefrontService);
  private readonly seo = inject(StorefrontSeoService);
  protected readonly statement = signal<CustomerStatement | null>(null);
  protected readonly loading = signal(true);
  protected readonly activityLoading = signal(false);
  protected readonly printing = signal(false);
  protected readonly printError = signal<string | null>(null);
  protected readonly printActivities = signal<CustomerStatement['activities']>([]);
  private token: string | null = null;

  async ngOnInit(): Promise<void> {
    this.seo.set('Private customer statement', 'Secure customer statement.', '/statement', true);
    try {
      this.token = this.route.snapshot.paramMap.get('token');
      if (this.token) this.statement.set(await this.storefront.customerStatement(this.token));
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadOlderActivity(): Promise<void> {
    const current = this.statement();
    const cursor = current?.activities[current.activities.length - 1];
    if (!this.token || !current?.activity_has_more || !cursor || this.activityLoading()) return;
    this.activityLoading.set(true);
    try {
      const page = await this.storefront.customerStatement(this.token, {
        date: cursor.date,
        id: cursor.id,
      });
      if (!page) {
        this.statement.set(null);
        return;
      }
      this.statement.set({
        ...current,
        activities: [...current.activities, ...page.activities],
        activity_has_more: page.activity_has_more,
      });
    } finally {
      this.activityLoading.set(false);
    }
  }

  protected async printStatement(): Promise<void> {
    const current = this.statement();
    if (!this.token || !current || this.printing()) return;
    this.printing.set(true);
    this.printError.set(null);
    try {
      const activities = [...current.activities];
      let hasMore = current.activity_has_more ?? false;
      const visitedCursors = new Set<string>();
      while (hasMore) {
        const cursor = activities[activities.length - 1];
        if (!cursor) break;
        const cursorKey = `${cursor.date}:${cursor.id}`;
        if (visitedCursors.has(cursorKey)) {
          throw new Error('Statement preparation stopped because pagination did not advance.');
        }
        visitedCursors.add(cursorKey);
        const page = await this.storefront.customerStatement(this.token, {
          date: cursor.date,
          id: cursor.id,
        });
        if (!page) throw new Error('The complete statement could not be loaded.');
        if (page.activities.length === 0) {
          if (page.activity_has_more)
            throw new Error('The complete statement could not be loaded.');
          break;
        }
        activities.push(...page.activities);
        hasMore = page.activity_has_more ?? false;
      }
      this.printActivities.set(activities);
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      window.print();
    } catch (error) {
      this.printError.set(
        error instanceof Error ? error.message : 'Statement could not be printed'
      );
    } finally {
      this.printing.set(false);
    }
  }

  protected printRows(statement: CustomerStatement): CustomerStatement['activities'] {
    const rows = this.printActivities().length > 0 ? this.printActivities() : statement.activities;
    return [...rows].sort(
      (left, right) =>
        new Date(left.date).getTime() - new Date(right.date).getTime() ||
        left.id.localeCompare(right.id)
    );
  }

  protected activityDebit(activity: CustomerStatement['activities'][number]): number {
    return activity.debit ?? (activity.direction === 'charge' ? activity.amount : 0);
  }

  protected activityCredit(activity: CustomerStatement['activities'][number]): number {
    return activity.credit ?? (activity.direction === 'payment' ? activity.amount : 0);
  }

  protected money(value: number): string {
    return `KES ${Math.round(value).toLocaleString('en-KE')}`;
  }
  protected date(value: string): string {
    return new Date(value).toLocaleDateString('en-KE', { dateStyle: 'medium' });
  }
  protected activityLabel(kind: string): string {
    const labels: Record<string, string> = {
      credit_sale: 'Credit sale',
      customer_receipt: 'Payment received',
      customer_receipt_reversal: 'Payment reversed',
      customer_deposit_refund: 'Downpayment refunded',
      order_reversal: 'Sale reversed',
      balance_adjustment: 'Balance adjustment',
    };
    return labels[kind] ?? kind.replace(/_/g, ' ').replace(/^./, value => value.toUpperCase());
  }
  protected companyLogoUrl(path: string | null): string | null {
    return this.storefront.companyLogoUrl(path);
  }
  protected waLink(phone: string, store: string): string {
    return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${store}, I have a question about my statement.`)}`;
  }
  protected legalUrl(path: 'privacy' | 'terms'): string {
    return this.storefront.legalUrl(path);
  }
}
