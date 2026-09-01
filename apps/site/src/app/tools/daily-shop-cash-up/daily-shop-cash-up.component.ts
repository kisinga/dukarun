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
import { appUrl } from '../../core/public-url';
import { IconComponent } from '../../shared/ui/icon.component';
import {
  CashUpField,
  CashUpFormValues,
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

type CashUpStep = 1 | 2 | 3;

interface StepLabel {
  readonly number: CashUpStep;
  readonly short: string;
}

@Component({
  selector: 'app-daily-shop-cash-up',
  imports: [RouterLink, NgTemplateOutlet, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cash-up-tool-page">
      <section class="tool-hero screen-only border-b border-base-300/60">
        <div class="mkt-container py-12 sm:py-18">
          <div class="max-w-3xl">
            <p class="mkt-eyebrow">Free daily closing tool</p>
            <h1 class="mkt-display mt-4">Do today’s money and sales agree?</h1>
            <p class="mkt-lead mt-5 max-w-2xl">
              Follow three short steps to compare your sales record with counted cash and M-Pesa
              receipts before you close the shop.
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
                About two minutes
              </span>
            </div>
          </div>
        </div>
      </section>

      <section class="mkt-container py-8 sm:py-14">
        <nav class="screen-only mb-6" aria-label="Cash-up progress">
          <ol class="grid grid-cols-3 gap-2 sm:gap-3">
            @for (step of steps; track step.number) {
              <li>
                <button
                  type="button"
                  class="step-button"
                  [class.step-button-active]="currentStep() === step.number"
                  [class.step-button-complete]="currentStep() > step.number"
                  [attr.aria-current]="currentStep() === step.number ? 'step' : null"
                  (click)="goToStep(step.number)"
                >
                  <span class="step-number">{{ step.number }}</span>
                  <span class="hidden sm:inline">{{ step.short }}</span>
                </button>
              </li>
            }
          </ol>
        </nav>

        <div class="grid items-start gap-7 lg:grid-cols-[minmax(0,1.08fr)_minmax(21rem,0.92fr)]">
          <form
            class="cash-up-inputs mkt-card overflow-hidden"
            novalidate
            (submit)="$event.preventDefault()"
            aria-labelledby="cash-up-form-heading"
          >
            <div class="border-b border-base-300/70 bg-base-200/45 p-5 sm:p-7">
              <p class="mkt-eyebrow">Step {{ currentStep() }} of 3</p>
              @switch (currentStep()) {
                @case (1) {
                  <h2
                    id="cash-up-form-heading"
                    tabindex="-1"
                    class="mt-2 text-2xl font-bold tracking-tight"
                  >
                    Enter today’s recorded sales
                  </h2>
                  <p class="mt-2 mb-0 text-sm leading-relaxed text-base-content/65">
                    Use the figures in your sales book, POS or daily record. Leave a field blank if
                    it does not apply.
                  </p>
                }
                @case (2) {
                  <h2
                    id="cash-up-form-heading"
                    tabindex="-1"
                    class="mt-2 text-2xl font-bold tracking-tight"
                  >
                    Account for cash that moved
                  </h2>
                  <p class="mt-2 mb-0 text-sm leading-relaxed text-base-content/65">
                    Start with the opening float. Add expenses, banking or older debt payments only
                    when they happened today.
                  </p>
                }
                @case (3) {
                  <h2
                    id="cash-up-form-heading"
                    tabindex="-1"
                    class="mt-2 text-2xl font-bold tracking-tight"
                  >
                    Count and compare
                  </h2>
                  <p class="mt-2 mb-0 text-sm leading-relaxed text-base-content/65">
                    Count the physical cash. For M-Pesa, use incoming receipts for today, not the
                    current account balance.
                  </p>
                }
              }
            </div>

            <div class="p-5 sm:p-7">
              @switch (currentStep()) {
                @case (1) {
                  <fieldset>
                    <legend class="sr-only">Recorded sales</legend>
                    <div class="grid gap-5 sm:grid-cols-2">
                      @for (control of salesControls; track control.key) {
                        <ng-container
                          [ngTemplateOutlet]="moneyInput"
                          [ngTemplateOutletContext]="{ $implicit: control }"
                        />
                      }
                    </div>
                    <div class="mt-5 rounded-box bg-base-200/60 p-4 text-sm text-base-content/65">
                      Credit sales count as sales today, but not as cash or M-Pesa received today.
                    </div>
                  </fieldset>
                }

                @case (2) {
                  <fieldset>
                    <legend class="sr-only">Other money movements</legend>
                    <div class="max-w-md">
                      <ng-container
                        [ngTemplateOutlet]="moneyInput"
                        [ngTemplateOutletContext]="{ $implicit: openingCashControl }"
                      />
                    </div>

                    <button
                      type="button"
                      class="mt-6 flex min-h-11 w-full items-center justify-between rounded-box border border-base-300/70 bg-base-100 px-4 text-left text-sm font-semibold hover:border-primary/40"
                      [attr.aria-expanded]="showAdjustments()"
                      aria-controls="cash-up-adjustments"
                      (click)="showAdjustments.set(!showAdjustments())"
                    >
                      <span>
                        {{ showAdjustments() ? 'Hide' : 'Add' }} expenses, banking or old debt
                        payments
                      </span>
                      <span aria-hidden="true" class="text-lg text-primary">{{
                        showAdjustments() ? '−' : '+'
                      }}</span>
                    </button>

                    @if (showAdjustments()) {
                      <div id="cash-up-adjustments" class="mt-5 grid gap-5 sm:grid-cols-2">
                        @for (control of adjustmentControls; track control.key) {
                          <ng-container
                            [ngTemplateOutlet]="moneyInput"
                            [ngTemplateOutletContext]="{ $implicit: control }"
                          />
                        }
                      </div>
                    }
                  </fieldset>
                }

                @case (3) {
                  <fieldset>
                    <legend class="sr-only">Actual closing figures</legend>
                    <div class="grid gap-5 sm:grid-cols-2">
                      @for (control of closingControls; track control.key) {
                        <ng-container
                          [ngTemplateOutlet]="moneyInput"
                          [ngTemplateOutletContext]="{ $implicit: control }"
                        />
                      }
                    </div>
                    <p class="mt-5 mb-0 text-sm text-base-content/60">
                      Only use the channels your shop accepted today. You can check cash, M-Pesa or
                      both.
                    </p>
                    @if (closingPrompt()) {
                      <p class="mt-3 mb-0 text-sm font-medium text-error" role="alert">
                        {{ closingPrompt() }}
                      </p>
                    }
                  </fieldset>
                }
              }
            </div>

            <div
              class="no-print flex items-center justify-between gap-3 border-t border-base-300/70 bg-base-200/35 p-5 sm:px-7"
            >
              @if (currentStep() > 1) {
                <button type="button" class="btn btn-ghost min-h-11" (click)="previousStep()">
                  Back
                </button>
              } @else {
                <button type="button" class="btn btn-ghost min-h-11" (click)="reset()">
                  Clear
                </button>
              }

              @if (currentStep() < 3) {
                <button
                  type="button"
                  class="btn btn-primary min-h-11"
                  [disabled]="!canContinue(currentStep())"
                  (click)="nextStep()"
                >
                  Continue
                  <app-icon name="heroArrowRight" size="sm" />
                </button>
              } @else {
                <button type="button" class="btn btn-primary min-h-11" (click)="viewResult()">
                  See closing result
                  <app-icon name="heroArrowRight" size="sm" />
                </button>
              }
            </div>

            <ng-template #moneyInput let-control>
              <label class="form-control block" [for]="'cash-up-' + control.key">
                <span class="mb-1.5 block text-sm font-medium">{{ control.label }}</span>
                <span
                  class="input flex min-h-12 w-full items-center gap-2 bg-base-100"
                  [class.input-error]="fieldError(control.key)"
                >
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

          <aside
            id="cash-up-result"
            class="print-summary lg:sticky lg:top-24"
            aria-live="polite"
            tabindex="-1"
          >
            <div class="rounded-[1.25rem] bg-neutral p-6 text-neutral-content shadow-card sm:p-8">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Closing summary
              </p>

              @if (resultRevealed() && summary(); as result) {
                <div class="mt-2 flex flex-wrap items-start justify-between gap-3">
                  <h2 class="text-2xl font-bold tracking-tight">
                    {{ closingStatusTitle(result) }}
                  </h2>
                  <span
                    class="rounded-full border border-neutral-content/20 px-2.5 py-1 text-xs font-semibold"
                  >
                    {{ checkedChannelCount() }} of 2 checked
                  </span>
                </div>

                <dl
                  class="mt-6 grid grid-cols-2 gap-3 rounded-box bg-neutral-content/5 p-4 text-sm"
                >
                  <div>
                    <dt class="text-neutral-content/55">Recorded sales</dt>
                    <dd class="mt-1 font-bold tabular-nums">
                      {{ formatKes(result.recordedSales) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-neutral-content/55">Money received</dt>
                    <dd class="mt-1 font-bold tabular-nums">
                      {{ formatKes(result.moneyReceived) }}
                    </dd>
                  </div>
                </dl>

                <div class="mt-4 grid gap-3">
                  <section class="channel-card" aria-labelledby="cash-result-heading">
                    <div class="flex items-center justify-between gap-3">
                      <h3 id="cash-result-heading" class="font-semibold">Cash</h3>
                      @if (hasCashCount()) {
                        <span [class]="varianceBadgeClass(result.cashVariance)">
                          {{ varianceLabel(result.cashVariance) }}
                        </span>
                      } @else {
                        <span class="status-badge">Not checked</span>
                      }
                    </div>
                    <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p class="mb-0 text-neutral-content/50">Expected</p>
                        <p class="mt-1 mb-0 font-semibold tabular-nums">
                          {{ formatKes(result.expectedCash) }}
                        </p>
                      </div>
                      @if (hasCashCount()) {
                        <div class="text-right">
                          <p class="mb-0 text-neutral-content/50">Difference</p>
                          <p
                            class="mt-1 mb-0 font-bold tabular-nums"
                            [class]="varianceTextClass(result.cashVariance)"
                          >
                            {{ formatSignedKes(result.cashVariance) }}
                          </p>
                        </div>
                      }
                    </div>
                  </section>

                  <section class="channel-card" aria-labelledby="mpesa-result-heading">
                    <div class="flex items-center justify-between gap-3">
                      <h3 id="mpesa-result-heading" class="font-semibold">M-Pesa</h3>
                      @if (hasMpesaCount()) {
                        <span [class]="varianceBadgeClass(result.mpesaVariance)">
                          {{ varianceLabel(result.mpesaVariance) }}
                        </span>
                      } @else {
                        <span class="status-badge">Not checked</span>
                      }
                    </div>
                    <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p class="mb-0 text-neutral-content/50">Expected receipts</p>
                        <p class="mt-1 mb-0 font-semibold tabular-nums">
                          {{ formatKes(result.expectedMpesaReceipts) }}
                        </p>
                      </div>
                      @if (hasMpesaCount()) {
                        <div class="text-right">
                          <p class="mb-0 text-neutral-content/50">Difference</p>
                          <p
                            class="mt-1 mb-0 font-bold tabular-nums"
                            [class]="varianceTextClass(result.mpesaVariance)"
                          >
                            {{ formatSignedKes(result.mpesaVariance) }}
                          </p>
                        </div>
                      }
                    </div>
                  </section>
                </div>

                <div
                  class="mt-5 rounded-box border border-neutral-content/15 p-4 text-sm leading-relaxed"
                >
                  <p class="font-semibold">{{ nextActionTitle(result) }}</p>
                  <p class="mt-1 mb-0 text-neutral-content/65">{{ nextActionCopy(result) }}</p>
                </div>
              } @else if (summary() === null) {
                <h2 class="mt-2 text-2xl font-bold tracking-tight">Check an entered amount</h2>
                <div class="mt-6 rounded-box border border-error/45 bg-error/10 p-5" role="alert">
                  <p class="mb-0 text-sm leading-relaxed">
                    One of the amounts is invalid. Return to the highlighted field to continue.
                  </p>
                </div>
              } @else {
                <h2 class="mt-2 text-2xl font-bold tracking-tight">Your result will appear here</h2>
                <div class="mt-6 rounded-box border border-neutral-content/15 p-5">
                  <p class="mb-0 text-sm leading-relaxed text-neutral-content/65">
                    Complete the three steps, then choose “See closing result”. A blank closing
                    figure will stay “Not checked” instead of being treated as zero.
                  </p>
                </div>
              }

              <div
                class="no-print mt-6 flex flex-wrap gap-2 border-t border-neutral-content/15 pt-5"
              >
                <button
                  type="button"
                  class="btn btn-sm min-h-11 border-neutral-content/25 bg-transparent text-neutral-content hover:bg-neutral-content/10"
                  [disabled]="!canUseSummary()"
                  (click)="printSummary()"
                >
                  <app-icon name="heroPrinter" size="sm" />
                  Print
                </button>
                <button
                  type="button"
                  class="btn btn-sm min-h-11 border-neutral-content/25 bg-transparent text-neutral-content hover:bg-neutral-content/10"
                  (click)="shareTool()"
                >
                  <app-icon name="heroShare" size="sm" />
                  {{ shareNotice() || 'Share tool' }}
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm min-h-11 text-neutral-content/70"
                  (click)="reset()"
                >
                  Start again
                </button>
              </div>

              <p class="mt-5 mb-0 text-xs leading-relaxed text-neutral-content/50">
                This tool compares only the figures you enter. It can show a difference, but it
                cannot identify its cause.
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
              It may be a missed expense, incorrect change, a payment under the wrong method or a
              counting mistake. The tool points you to the channel to review first.
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
              100. M-Pesa agrees. Review the cash record before starting tomorrow.
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
            <p class="mkt-eyebrow">Older debt payments</p>
            <h2 class="mt-2 text-xl font-bold">Money received is not always a new sale.</h2>
            <p class="mt-3 mb-0 leading-relaxed text-base-content/70">
              A payment for older customer credit increases today’s receipts. The sale was recorded
              earlier, so counting it again would overstate today’s sales.
            </p>
          </article>
        </div>
      </section>

      <section class="screen-only bg-primary text-primary-content">
        <div class="mkt-container py-14 text-center sm:py-20">
          <h2 class="mkt-h1">Make this the normal way your shop closes.</h2>
          <p class="mx-auto mt-4 max-w-2xl text-primary-content/80">
            Dukarun connects each sale to its payment, stock movement, cashier session and books so
            the closing figures are ready when the workday ends.
          </p>
          <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              [href]="appUrl('/register')"
              class="btn btn-lg min-h-12 border-white bg-white text-primary hover:bg-white/90"
            >
              Start my shop
              <app-icon name="heroArrowRight" size="sm" />
            </a>
            <a
              [href]="setupWhatsAppUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="btn whatsapp-action min-h-12"
            >
              <app-icon name="whatsapp" size="md" />
              I need setup and training
            </a>
          </div>
          <p class="mt-6 text-sm text-primary-content/75">
            Want to understand the workflow first?
            <a
              routerLink="/docs"
              fragment="cashier-sessions"
              class="font-semibold underline underline-offset-4"
            >
              Read the closing guide
            </a>
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
    .step-button {
      display: flex;
      min-height: 3rem;
      width: 100%;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      border: 1px solid color-mix(in oklab, var(--color-base-300) 75%, transparent);
      border-radius: var(--radius-box);
      background: var(--color-base-100);
      color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
      font-size: 0.875rem;
      font-weight: 600;
    }
    .step-button-active {
      border-color: var(--color-primary);
      color: var(--color-base-content);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--color-primary) 35%, transparent);
    }
    .step-button-complete {
      color: var(--color-primary);
    }
    .step-number {
      display: inline-flex;
      height: 1.5rem;
      width: 1.5rem;
      align-items: center;
      justify-content: center;
      border-radius: 9999px;
      background: color-mix(in oklab, var(--color-primary) 12%, transparent);
      color: var(--color-primary);
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
    }
    .step-button-active .step-number {
      background: var(--color-primary);
      color: var(--color-primary-content);
    }
    .channel-card {
      border: 1px solid color-mix(in oklab, var(--color-neutral-content) 15%, transparent);
      border-radius: var(--radius-box);
      padding: 1rem;
    }
    .print-summary {
      scroll-margin-top: 5.5rem;
    }
    .status-badge {
      border: 1px solid color-mix(in oklab, var(--color-neutral-content) 20%, transparent);
      border-radius: 9999px;
      padding: 0.2rem 0.55rem;
      color: color-mix(in oklab, var(--color-neutral-content) 62%, transparent);
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .status-balanced {
      border-color: color-mix(in oklab, var(--color-success) 55%, transparent);
      color: var(--color-success);
    }
    .status-short {
      border-color: color-mix(in oklab, var(--color-error) 55%, transparent);
      color: var(--color-error);
    }
    .status-over {
      border-color: color-mix(in oklab, var(--color-warning) 55%, transparent);
      color: var(--color-warning);
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
  protected readonly appUrl = appUrl;
  protected readonly currentStep = signal<CashUpStep>(1);
  protected readonly showAdjustments = signal(false);
  protected readonly resultRevealed = signal(false);
  protected readonly closingPrompt = signal<string | null>(null);
  protected readonly values = signal<CashUpFormValues>(emptyCashUpForm());
  protected readonly parsed = computed(() => parseCashUpForm(this.values()));
  protected readonly summary = computed(() => {
    const input = this.parsed().input;
    return input ? calculateCashUp(input) : null;
  });
  protected readonly hasCashCount = computed(() => this.hasValue('actualClosingCash'));
  protected readonly hasMpesaCount = computed(() => this.hasValue('actualMpesaReceipts'));
  protected readonly checkedChannelCount = computed(
    () => Number(this.hasCashCount()) + Number(this.hasMpesaCount())
  );
  protected readonly canUseSummary = computed(
    () => this.resultRevealed() && this.summary() !== null && this.checkedChannelCount() > 0
  );
  protected readonly shareNotice = signal<string | null>(null);
  protected readonly setupWhatsAppUrl = dukarunWhatsAppUrl(
    'Hello Dukarun, I used the daily cash-up tool and would like to discuss setup and staff training. My business type is:'
  );

  protected readonly steps: StepLabel[] = [
    { number: 1, short: 'Recorded sales' },
    { number: 2, short: 'Money moved' },
    { number: 3, short: 'Count and compare' },
  ];

  protected readonly salesControls: CashUpControl[] = [
    { key: 'cashSales', label: 'Cash sales', help: 'Sales paid in cash today.' },
    { key: 'mpesaSales', label: 'M-Pesa sales', help: 'Sales paid through M-Pesa today.' },
    {
      key: 'creditSales',
      label: 'Credit sales',
      help: 'Sales made today that customers will pay later.',
    },
  ];

  protected readonly openingCashControl: CashUpControl = {
    key: 'openingCash',
    label: 'Opening cash float',
    help: 'Cash in the drawer before the first sale.',
  };

  protected readonly adjustmentControls: CashUpControl[] = [
    {
      key: 'cashExpenses',
      label: 'Cash expenses or payouts',
      help: 'Recorded cash that left the drawer during the day.',
    },
    {
      key: 'cashRemoved',
      label: 'Cash removed or banked',
      help: 'Cash deliberately taken out before closing.',
    },
    {
      key: 'cashDebtRepayments',
      label: 'Old debt paid in cash',
      help: 'Cash received today for a credit sale recorded earlier.',
    },
    {
      key: 'mpesaDebtRepayments',
      label: 'Old debt paid by M-Pesa',
      help: 'M-Pesa received today for a credit sale recorded earlier.',
    },
  ];

  protected readonly closingControls: CashUpControl[] = [
    {
      key: 'actualClosingCash',
      label: 'Cash counted at closing',
      help: 'The physical cash in the drawer now.',
    },
    {
      key: 'actualMpesaReceipts',
      label: 'M-Pesa receipts today',
      help: 'Total incoming shop receipts shown for today.',
    },
  ];

  private readonly fieldsByStep: Record<CashUpStep, readonly CashUpField[]> = {
    1: this.salesControls.map(control => control.key),
    2: [this.openingCashControl.key, ...this.adjustmentControls.map(control => control.key)],
    3: this.closingControls.map(control => control.key),
  };

  protected readonly exampleLines = [
    { label: 'Opening cash', value: 'KES 2,000' },
    { label: 'Cash sales', value: 'KES 8,400' },
    { label: 'M-Pesa sales', value: 'KES 6,300' },
    { label: 'Credit sales', value: 'KES 1,500' },
    { label: 'Older debt received', value: 'KES 1,000' },
    { label: 'Cash expenses', value: 'KES 500' },
    { label: 'Cash removed', value: 'KES 4,000' },
    { label: 'Counted cash', value: 'KES 6,400' },
  ];

  protected setValue(field: CashUpField, value: string): void {
    this.values.update(current => ({ ...current, [field]: value }));
    this.closingPrompt.set(null);
  }

  protected fieldValue(field: CashUpField): string {
    return this.values()[field];
  }

  protected fieldError(field: CashUpField): string | null {
    return this.parsed().errors[field] ?? null;
  }

  protected hasValue(field: CashUpField): boolean {
    return this.values()[field].trim().length > 0;
  }

  protected canContinue(step: CashUpStep): boolean {
    return this.fieldsByStep[step].every(field => !this.fieldError(field));
  }

  protected goToStep(step: CashUpStep): void {
    this.currentStep.set(step);
    this.focusFormHeading();
  }

  protected nextStep(): void {
    const step = this.currentStep();
    if (step >= 3 || !this.canContinue(step)) return;
    this.goToStep((step + 1) as CashUpStep);
  }

  protected previousStep(): void {
    const step = this.currentStep();
    if (step <= 1) return;
    this.goToStep((step - 1) as CashUpStep);
  }

  protected viewResult(): void {
    if (!this.canContinue(3)) return;
    if (this.checkedChannelCount() === 0) {
      this.closingPrompt.set('Enter counted cash or today’s M-Pesa receipts to make a comparison.');
      return;
    }
    this.resultRevealed.set(true);
    this.closingPrompt.set(null);
    if (isPlatformBrowser(this.platformId)) {
      requestAnimationFrame(() => document.getElementById('cash-up-result')?.focus());
    }
  }

  protected reset(): void {
    this.values.set(emptyCashUpForm());
    this.currentStep.set(1);
    this.showAdjustments.set(false);
    this.resultRevealed.set(false);
    this.closingPrompt.set(null);
    this.shareNotice.set(null);
    this.focusFormHeading();
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

  protected varianceBadgeClass(amount: number): string {
    return {
      balanced: 'status-badge status-balanced',
      short: 'status-badge status-short',
      over: 'status-badge status-over',
    }[varianceStatus(amount)];
  }

  protected varianceLabel(amount: number): string {
    return { balanced: 'Matches', short: 'Short', over: 'Over' }[varianceStatus(amount)];
  }

  protected closingStatusTitle(result: ReturnType<typeof calculateCashUp>): string {
    return this.hasAnyVariance(result) ? 'A difference needs review' : 'The checked figures agree';
  }

  protected nextActionTitle(result: ReturnType<typeof calculateCashUp>): string {
    return this.hasAnyVariance(result)
      ? 'Check before carrying it forward'
      : 'Closing check complete';
  }

  protected nextActionCopy(result: ReturnType<typeof calculateCashUp>): string {
    if (!this.hasAnyVariance(result)) {
      return this.checkedChannelCount() === 2
        ? 'Cash and M-Pesa both agree with the figures entered.'
        : 'The channel you checked agrees. Check the other channel too if the shop used it today.';
    }
    return 'Recount the affected channel, then confirm sales, expenses, banking and older debt payments were entered under the right method.';
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
          text: 'Compare today’s sales with counted cash and M-Pesa receipts.',
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

  private hasAnyVariance(result: ReturnType<typeof calculateCashUp>): boolean {
    return (
      (this.hasCashCount() && varianceStatus(result.cashVariance) !== 'balanced') ||
      (this.hasMpesaCount() && varianceStatus(result.mpesaVariance) !== 'balanced')
    );
  }

  private focusFormHeading(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    requestAnimationFrame(() => document.getElementById('cash-up-form-heading')?.focus());
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
