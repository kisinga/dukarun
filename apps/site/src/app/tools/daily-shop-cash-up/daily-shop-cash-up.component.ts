import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { dukarunWhatsAppUrl } from '../../core/public-contact';
import { IconComponent } from '../../shared/ui/icon.component';
import {
  CashUpField,
  CashUpFormValues,
  CashUpVarianceStatus,
  calculateCashUp,
  emptyCashUpForm,
  parseCashUpForm,
  varianceStatus,
} from './cash-up-calculator';

interface CashUpControl {
  readonly key: CashUpField;
  readonly label: string;
  readonly help: string;
}

@Component({
  selector: 'app-daily-shop-cash-up',
  imports: [RouterLink, NgTemplateOutlet, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cash-up-tool-page">
      <section class="tool-hero screen-only border-b border-base-300/60">
        <div class="mkt-container py-14 sm:py-20">
          <div class="max-w-3xl">
            <p class="mkt-eyebrow">Free shop tool</p>
            <h1 class="mkt-display mt-4">Close the day with the numbers clear.</h1>
            <p class="mkt-lead mt-5 max-w-2xl">
              Enter what the shop recorded, count the cash, check M-Pesa and see any difference
              before you go home.
            </p>
            <div class="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-base-content/60">
              <span class="flex items-center gap-2">
                <app-icon name="heroCheckCircle" size="sm" class="text-primary" />
                No account needed
              </span>
              <span class="flex items-center gap-2">
                <app-icon name="heroCheckCircle" size="sm" class="text-primary" />
                Nothing is saved
              </span>
              <span class="flex items-center gap-2">
                <app-icon name="heroCheckCircle" size="sm" class="text-primary" />
                Built for cash, M-Pesa and credit
              </span>
            </div>
          </div>
        </div>
      </section>

      <section class="mkt-container py-10 sm:py-16">
        <div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <form
            class="cash-up-inputs mkt-card overflow-hidden"
            novalidate
            (submit)="$event.preventDefault()"
            aria-labelledby="cash-up-form-heading"
          >
            <div class="border-b border-base-300/70 bg-base-200/45 p-5 sm:p-7">
              <p class="mkt-eyebrow">Today’s figures</p>
              <h2 id="cash-up-form-heading" class="mt-2 text-2xl font-bold tracking-tight">
                What did the shop record?
              </h2>
              <p class="mt-2 mb-0 text-sm leading-relaxed text-base-content/65">
                Use the sales record, M-Pesa statement and counted drawer. Leave a field blank when
                it does not apply.
              </p>
            </div>

            <div class="grid gap-8 p-5 sm:p-7">
              <fieldset>
                <legend class="font-semibold">Sales and money received</legend>
                <p class="mt-1 text-sm text-base-content/60">
                  Keep today’s sales separate from payments for older customer credit.
                </p>
                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  @for (control of recordedControls; track control.key) {
                    <ng-container
                      [ngTemplateOutlet]="moneyInput"
                      [ngTemplateOutletContext]="{ $implicit: control }"
                    />
                  }
                </div>
              </fieldset>

              <fieldset class="border-t border-base-300/60 pt-7">
                <legend class="font-semibold">Count the cash</legend>
                <p class="mt-1 text-sm text-base-content/60">
                  Include cash that left the drawer so the expected closing amount stays fair.
                </p>
                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  @for (control of cashControls; track control.key) {
                    <ng-container
                      [ngTemplateOutlet]="moneyInput"
                      [ngTemplateOutletContext]="{ $implicit: control }"
                    />
                  }
                </div>
              </fieldset>

              <fieldset class="border-t border-base-300/60 pt-7">
                <legend class="font-semibold">Check M-Pesa</legend>
                <p class="mt-1 text-sm text-base-content/60">
                  Use the total receipts shown for the day, not the current account balance.
                </p>
                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  @for (control of mpesaControls; track control.key) {
                    <ng-container
                      [ngTemplateOutlet]="moneyInput"
                      [ngTemplateOutletContext]="{ $implicit: control }"
                    />
                  }
                </div>
              </fieldset>

              <div class="no-print flex flex-wrap gap-3 border-t border-base-300/60 pt-6">
                <button type="button" class="btn btn-outline min-h-11" (click)="reset()">
                  Reset figures
                </button>
                <button
                  type="button"
                  class="btn btn-ghost min-h-11"
                  [disabled]="!canUseSummary()"
                  (click)="printSummary()"
                >
                  <app-icon name="heroPrinter" size="sm" />
                  Print summary
                </button>
                <button type="button" class="btn btn-ghost min-h-11" (click)="shareTool()">
                  <app-icon name="heroShare" size="sm" />
                  {{ shareNotice() || 'Share tool' }}
                </button>
              </div>
            </div>

            <ng-template #moneyInput let-control>
              <label class="form-control block" [for]="'cash-up-' + control.key">
                <span class="mb-1.5 block text-sm font-medium">{{ control.label }}</span>
                <span class="input flex min-h-12 w-full items-center gap-2">
                  <span class="text-sm font-semibold text-base-content/45">KES</span>
                  <input
                    [id]="'cash-up-' + control.key"
                    type="number"
                    min="0"
                    step="0.01"
                    inputmode="decimal"
                    autocomplete="off"
                    placeholder="0"
                    class="min-w-0 flex-1 tabular-nums"
                    [value]="fieldValue(control.key)"
                    [attr.aria-invalid]="fieldError(control.key) ? 'true' : null"
                    [attr.aria-describedby]="'cash-up-help-' + control.key"
                    (input)="setValue(control.key, $any($event.target).value)"
                  />
                </span>
                <span
                  [id]="'cash-up-help-' + control.key"
                  class="mt-1.5 block text-xs leading-relaxed"
                  [class.text-error]="fieldError(control.key)"
                  [class.text-base-content/55]="!fieldError(control.key)"
                >
                  {{ fieldError(control.key) || control.help }}
                </span>
              </label>
            </ng-template>
          </form>

          <aside class="print-summary lg:sticky lg:top-24" aria-live="polite">
            <div class="rounded-[1.25rem] bg-neutral p-6 text-neutral-content shadow-card sm:p-8">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Closing summary
              </p>
              <h2 class="mt-2 text-2xl font-bold tracking-tight">What the figures say</h2>

              @if (summary(); as result) {
                @if (hasEnteredValues()) {
                  <dl class="mt-6 grid gap-4">
                    <div class="summary-row">
                      <dt>Recorded sales</dt>
                      <dd>{{ formatKes(result.recordedSales) }}</dd>
                    </div>
                    <div class="summary-row">
                      <dt>Money received</dt>
                      <dd>{{ formatKes(result.moneyReceived) }}</dd>
                    </div>
                    <div class="summary-row border-t border-neutral-content/15 pt-4">
                      <dt>Expected closing cash</dt>
                      <dd>{{ formatKes(result.expectedCash) }}</dd>
                    </div>
                    <div class="summary-row">
                      <dt>Cash difference</dt>
                      <dd [class]="varianceTextClass(result.cashVariance)">
                        {{ formatSignedKes(result.cashVariance) }}
                      </dd>
                    </div>
                    <div class="summary-row">
                      <dt>Expected M-Pesa receipts</dt>
                      <dd>{{ formatKes(result.expectedMpesaReceipts) }}</dd>
                    </div>
                    <div class="summary-row">
                      <dt>M-Pesa difference</dt>
                      <dd [class]="varianceTextClass(result.mpesaVariance)">
                        {{ formatSignedKes(result.mpesaVariance) }}
                      </dd>
                    </div>
                  </dl>

                  <div
                    class="mt-6 rounded-box border p-4"
                    [class]="variancePanelClass(result.totalVariance)"
                  >
                    <p class="text-xs font-semibold uppercase tracking-wider opacity-75">
                      Overall difference
                    </p>
                    <p class="mt-1 text-2xl font-bold tabular-nums">
                      {{ formatSignedKes(result.totalVariance) }}
                    </p>
                    <p class="mt-2 mb-0 text-sm leading-relaxed opacity-80">
                      {{ varianceMessage(result.totalVariance) }}
                    </p>
                  </div>
                } @else {
                  <div class="mt-8 rounded-box border border-neutral-content/15 p-5">
                    <p class="mb-0 text-sm leading-relaxed text-neutral-content/65">
                      Start with the opening float or today’s sales. Your closing summary will
                      update here as you enter the figures.
                    </p>
                  </div>
                }
              } @else {
                <div class="mt-8 rounded-box border border-error/45 bg-error/10 p-5" role="alert">
                  <p class="mb-0 text-sm leading-relaxed">
                    Check the highlighted amount. The summary will return when every value is valid.
                  </p>
                </div>
              }

              <p class="mt-6 mb-0 text-xs leading-relaxed text-neutral-content/50">
                This tool only compares the figures you enter. A difference is a prompt to review
                the records. It does not identify the cause.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section class="screen-only border-y border-base-300/60 bg-base-200/55 py-14 sm:py-20">
        <div class="mkt-container grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
          <div>
            <p class="mkt-eyebrow">Worked example</p>
            <h2 class="mkt-h2 mt-2">A KES 100 difference is worth checking today.</h2>
            <p class="mkt-lead mt-4">
              The difference may be a missed expense, change given incorrectly, a payment recorded
              under the wrong method or a simple counting mistake. Start with the record.
            </p>
          </div>
          <div class="mkt-card overflow-hidden bg-base-100">
            <div class="grid gap-px bg-base-300/60 sm:grid-cols-2">
              @for (line of exampleLines; track line.label) {
                <div class="flex items-center justify-between gap-4 bg-base-100 px-5 py-3 text-sm">
                  <span class="text-base-content/65">{{ line.label }}</span>
                  <strong class="tabular-nums">{{ line.value }}</strong>
                </div>
              }
            </div>
            <div
              class="border-t border-base-300/60 p-5 text-sm leading-relaxed text-base-content/70"
            >
              Expected cash is KES 6,500. The counted drawer has KES 6,400, so cash is short by KES
              100. M-Pesa agrees with the recorded receipts. Review the cash record before starting
              tomorrow.
            </div>
          </div>
        </div>
      </section>

      <section class="screen-only mkt-container py-14 sm:py-20">
        <div class="grid gap-5 md:grid-cols-2">
          <article class="mkt-card p-6 sm:p-7">
            <p class="mkt-eyebrow">Credit sales</p>
            <h2 class="mt-2 text-xl font-bold">A sale can happen before money arrives.</h2>
            <p class="mt-3 mb-0 leading-relaxed text-base-content/70">
              Credit sales belong in today’s sales because goods or services were provided today.
              They do not belong in cash or M-Pesa until the customer pays.
            </p>
          </article>
          <article class="mkt-card p-6 sm:p-7">
            <p class="mkt-eyebrow">Debt repayments</p>
            <h2 class="mt-2 text-xl font-bold">Money received is not always a new sale.</h2>
            <p class="mt-3 mb-0 leading-relaxed text-base-content/70">
              A payment for older customer credit increases today’s cash or M-Pesa receipts. The
              sale was recorded earlier, so counting it again would overstate today’s sales.
            </p>
          </article>
        </div>
      </section>

      <section class="screen-only bg-primary text-primary-content">
        <div class="mkt-container py-14 text-center sm:py-20">
          <h2 class="mkt-h1">Want every sale and payment connected before closing time?</h2>
          <p class="mx-auto mt-4 max-w-2xl text-primary-content/80">
            Dukarun ties each sale to its payment method, stock movement, cashier session and books.
            The closing record shows what should be in the drawer and any difference that needs a
            review.
          </p>
          <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              routerLink="/docs"
              fragment="cashier-sessions"
              class="btn btn-lg min-h-12 bg-white text-primary hover:bg-white/90"
            >
              See how Dukarun closes the day
              <app-icon name="heroArrowRight" size="sm" />
            </a>
            <a
              [href]="whatsappUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="btn whatsapp-action min-h-12"
            >
              <app-icon name="whatsapp" size="md" />
              Talk through my shop closing
            </a>
          </div>
          <p class="mt-6 text-sm text-primary-content/75">
            You can also read
            <a
              routerLink="/blog/how-to-know-shop-profit-kenya"
              class="font-semibold underline underline-offset-4"
            >
              how to tell whether the shop made money today
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  `,
  styles: `
    .tool-hero {
      background:
        radial-gradient(
          circle at 82% 20%,
          color-mix(in oklab, var(--color-primary) 14%, transparent),
          transparent 28rem
        ),
        linear-gradient(
          180deg,
          var(--color-base-100),
          color-mix(in oklab, var(--color-base-200) 55%, var(--color-base-100))
        );
    }
    .summary-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      font-size: 0.875rem;
    }
    .summary-row dt {
      color: color-mix(in oklab, var(--color-neutral-content) 62%, transparent);
    }
    .summary-row dd {
      flex: none;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    @media print {
      .screen-only,
      .cash-up-inputs,
      .no-print {
        display: none !important;
      }
      .print-summary {
        position: static;
        max-width: 40rem;
        margin: 0 auto;
        print-color-adjust: exact;
      }
    }
  `,
})
export class DailyShopCashUpComponent {
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly values = signal<CashUpFormValues>(emptyCashUpForm());
  protected readonly parsed = computed(() => parseCashUpForm(this.values()));
  protected readonly summary = computed(() => {
    const input = this.parsed().input;
    return input ? calculateCashUp(input) : null;
  });
  protected readonly hasEnteredValues = computed(() =>
    Object.values(this.values()).some(value => value.trim().length > 0)
  );
  protected readonly canUseSummary = computed(
    () => this.hasEnteredValues() && this.summary() !== null
  );
  protected readonly shareNotice = signal<string | null>(null);
  protected readonly whatsappUrl = dukarunWhatsAppUrl(
    'Hello Dukarun, I used the daily shop cash-up tool and would like to talk through my shop closing.'
  );

  protected readonly recordedControls: CashUpControl[] = [
    {
      key: 'openingCash',
      label: 'Opening cash float',
      help: 'Cash placed in the drawer before the first sale.',
    },
    {
      key: 'cashSales',
      label: 'Recorded cash sales',
      help: 'Sales paid in cash today.',
    },
    {
      key: 'mpesaSales',
      label: 'Recorded M-Pesa sales',
      help: 'Sales paid through M-Pesa today.',
    },
    {
      key: 'creditSales',
      label: 'Credit sales',
      help: 'Sales made today that customers will pay later.',
    },
    {
      key: 'cashDebtRepayments',
      label: 'Old debt paid in cash',
      help: 'Cash received today for customer credit recorded earlier.',
    },
    {
      key: 'mpesaDebtRepayments',
      label: 'Old debt paid by M-Pesa',
      help: 'M-Pesa received today for customer credit recorded earlier.',
    },
  ];

  protected readonly cashControls: CashUpControl[] = [
    {
      key: 'cashExpenses',
      label: 'Cash expenses or payouts',
      help: 'Recorded cash that left the drawer during the day.',
    },
    {
      key: 'cashRemoved',
      label: 'Cash removed or banked',
      help: 'Cash deliberately taken out before the closing count.',
    },
    {
      key: 'actualClosingCash',
      label: 'Actual closing cash counted',
      help: 'The physical cash in the drawer at closing.',
    },
  ];

  protected readonly mpesaControls: CashUpControl[] = [
    {
      key: 'actualMpesaReceipts',
      label: 'Actual M-Pesa receipts',
      help: 'Total incoming M-Pesa receipts shown for this shop today.',
    },
  ];

  protected readonly exampleLines = [
    { label: 'Opening cash', value: 'KES 2,000' },
    { label: 'Cash sales', value: 'KES 8,400' },
    { label: 'M-Pesa sales', value: 'KES 6,300' },
    { label: 'Credit sales', value: 'KES 1,500' },
    { label: 'Debt paid in cash', value: 'KES 600' },
    { label: 'Debt paid by M-Pesa', value: 'KES 400' },
    { label: 'Cash expenses', value: 'KES 500' },
    { label: 'Cash removed', value: 'KES 4,000' },
    { label: 'Counted cash', value: 'KES 6,400' },
    { label: 'Actual M-Pesa receipts', value: 'KES 6,700' },
  ];

  protected setValue(field: CashUpField, value: string): void {
    this.values.update(current => ({ ...current, [field]: value }));
  }

  protected fieldValue(field: CashUpField): string {
    return this.values()[field];
  }

  protected fieldError(field: CashUpField): string | null {
    return this.parsed().errors[field] ?? null;
  }

  protected reset(): void {
    this.values.set(emptyCashUpForm());
    this.shareNotice.set(null);
  }

  protected formatKes(minor: number): string {
    return `KES ${(minor / 100).toLocaleString('en-KE', {
      minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }

  protected formatSignedKes(minor: number): string {
    const sign = minor > 0 ? '+' : minor < 0 ? '-' : '';
    return `${sign}${this.formatKes(Math.abs(minor))}`;
  }

  protected varianceTextClass(amount: number): string {
    return {
      balanced: 'text-success',
      short: 'text-error',
      over: 'text-warning',
    }[varianceStatus(amount)];
  }

  protected variancePanelClass(amount: number): string {
    return {
      balanced: 'border-success/45 bg-success/10 text-success-content',
      short: 'border-error/45 bg-error/10 text-error-content',
      over: 'border-warning/45 bg-warning/10 text-warning-content',
    }[varianceStatus(amount)];
  }

  protected varianceMessage(amount: number): string {
    const messages: Record<CashUpVarianceStatus, string> = {
      balanced: 'The entered cash and M-Pesa figures agree with the shop record.',
      short: 'The entered receipts are lower than expected. Review the records and counts.',
      over: 'The entered receipts are higher than expected. Review the records and counts.',
    };
    return messages[varianceStatus(amount)];
  }

  protected printSummary(): void {
    if (!this.canUseSummary() || !isPlatformBrowser(this.platformId)) return;
    window.print();
  }

  protected async shareTool(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const url = new URL('/tools/daily-shop-cash-up', environment.sitePublicUrl).toString();
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Daily shop cash-up',
          text: 'Count the drawer, check M-Pesa and see the closing difference.',
          url,
        });
        this.showShareNotice('Shared');
      } else {
        this.showShareNotice((await this.copyUrl(url)) ? 'Link copied' : 'Copy unavailable');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.showShareNotice('Could not share');
    }
  }

  private showShareNotice(message: string): void {
    this.shareNotice.set(message);
    setTimeout(() => this.shareNotice.set(null), 2_000);
  }

  private async copyUrl(url: string): Promise<boolean> {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      return true;
    }
    const field = document.createElement('textarea');
    field.value = url;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  }
}
