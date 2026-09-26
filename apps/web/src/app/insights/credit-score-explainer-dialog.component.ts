import { Component, input, model } from '@angular/core';
import { formatKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { TaskDialogComponent } from '../shared/ui/task-dialog.component';
import type { PartyCreditProfile } from './insights.models';
import { ScoreBadgeComponent } from './score-badge.component';

type ScoreFactorKey = 'punctuality' | 'overdue' | 'utilization' | 'trend';

interface ScoreFactor {
  key: ScoreFactorKey;
  label: string;
  weight: number;
  summary: string;
}

const SCORE_FACTORS: readonly ScoreFactor[] = [
  {
    key: 'punctuality',
    label: 'Payment timeliness',
    weight: 45,
    summary: 'How promptly document payments were made, weighted by amount and recency.',
  },
  {
    key: 'overdue',
    label: 'Overdue exposure',
    weight: 30,
    summary: 'The overdue share of the live balance; impact rises after 7, 30, and 60 days.',
  },
  {
    key: 'utilization',
    label: 'Limit utilization',
    weight: 15,
    summary: 'Full marks through 50% used, then declines to zero at 100% of the limit.',
  },
  {
    key: 'trend',
    label: 'Recent direction',
    weight: 10,
    summary: 'Compares payment timing in the last 90 days with the preceding 90 days.',
  },
];

@Component({
  selector: 'app-credit-score-explainer-dialog',
  imports: [ButtonComponent, IconComponent, ScoreBadgeComponent, TaskDialogComponent],
  template: `
    <app-task-dialog
      [(open)]="open"
      title="How the score works"
      subtitle="A transparent 0–10 view of payment evidence and current exposure"
      size="lg"
    >
      <div class="space-y-6">
        <section
          class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-200/50 p-4 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Current credit score"
        >
          <div>
            <p class="type-caption">Current result</p>
            <p class="mt-1 text-sm text-base-content/70">
              Recalculated when credit activity or an aging threshold changes.
            </p>
          </div>
          <app-score-badge
            [score]="profile().score"
            [band]="profile().band"
            [confidence]="profile().confidence"
          />
        </section>

        <section aria-labelledby="score-weights-title">
          <div class="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 id="score-weights-title" class="section-title">Base model weights</h3>
              <p class="type-caption mt-1">
                Unavailable signals are skipped; the remaining weights are rebalanced.
              </p>
            </div>
            <span class="text-xs font-medium text-base-content/60">Total 100%</span>
          </div>

          <div
            class="mt-3 flex h-4 overflow-hidden rounded-full bg-base-200 ring-1 ring-base-300"
            role="img"
            aria-label="Payment timeliness 45 percent, overdue exposure 30 percent, limit utilization 15 percent, recent direction 10 percent"
          >
            @for (factor of factors; track factor.key) {
              <span
                class="h-full transition-opacity"
                [style.width.%]="factor.weight"
                [class.bg-success]="factor.key === 'punctuality'"
                [class.bg-warning]="factor.key === 'overdue'"
                [class.bg-info]="factor.key === 'utilization'"
                [class.bg-secondary]="factor.key === 'trend'"
                [class.opacity-25]="!factorActive(factor.key)"
                [attr.title]="factor.label + ': ' + factor.weight + '%'"
              ></span>
            }
          </div>
          <p class="type-caption mt-2">
            Solid segments are active for this profile; faded segments are waiting for evidence.
          </p>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            @for (factor of factors; track factor.key) {
              <article class="rounded-box border border-base-300 p-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-2">
                    <span
                      class="size-2.5 shrink-0 rounded-full"
                      [class.bg-success]="factor.key === 'punctuality'"
                      [class.bg-warning]="factor.key === 'overdue'"
                      [class.bg-info]="factor.key === 'utilization'"
                      [class.bg-secondary]="factor.key === 'trend'"
                      [class.opacity-25]="!factorActive(factor.key)"
                    ></span>
                    <h4 class="truncate text-sm font-semibold">{{ factor.label }}</h4>
                  </div>
                  <span class="font-mono text-sm font-bold tabular-nums">{{ factor.weight }}%</span>
                </div>
                <p class="mt-2 text-sm text-base-content/70">{{ factor.summary }}</p>
                <p
                  class="mt-2 text-xs font-medium"
                  [class.text-base-content/50]="!factorActive(factor.key)"
                >
                  This profile: {{ factorStatus(factor.key) }}
                </p>
              </article>
            }
          </div>
        </section>

        <section class="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div class="rounded-box border border-base-300 p-4">
            <h3 class="section-title">How evidence becomes a score</h3>
            <ol class="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Credit scoring steps">
              <li class="relative rounded-box bg-base-200 p-3">
                <span class="text-xs font-bold text-primary">01</span>
                <p class="mt-1 text-sm font-semibold">Measure</p>
                <p class="mt-1 text-xs text-base-content/65">
                  Each available signal becomes a 0–100 result.
                </p>
              </li>
              <li class="relative rounded-box bg-base-200 p-3">
                <span class="text-xs font-bold text-primary">02</span>
                <p class="mt-1 text-sm font-semibold">Weight</p>
                <p class="mt-1 text-xs text-base-content/65">
                  The active signals are combined into a score out of 10.
                </p>
              </li>
              <li class="relative rounded-box bg-base-200 p-3">
                <span class="text-xs font-bold text-primary">03</span>
                <p class="mt-1 text-sm font-semibold">Guardrail</p>
                <p class="mt-1 text-xs text-base-content/65">
                  Exposure caps are applied before the score receives a band.
                </p>
              </li>
            </ol>

            <div class="mt-4 border-t border-base-300 pt-4">
              <h4 class="text-sm font-semibold">Payment timing scale</h4>
              <div
                class="mt-2 grid grid-cols-5 overflow-hidden rounded-box border border-base-300 text-center text-xs"
              >
                <div class="bg-success/15 px-1 py-2"><b class="block">100%</b>On time</div>
                <div class="bg-success/10 px-1 py-2"><b class="block">80%</b>1–7d late</div>
                <div class="bg-warning/15 px-1 py-2"><b class="block">50%</b>8–30d</div>
                <div class="bg-warning/25 px-1 py-2"><b class="block">20%</b>31–60d</div>
                <div class="bg-error/15 px-1 py-2"><b class="block">0%</b>61d+</div>
              </div>
            </div>
          </div>

          <div class="rounded-box border border-base-300 p-4">
            <h3 class="section-title">Safety caps</h3>
            <p class="type-caption mt-1">Caps can lower—but never raise—the weighted result.</p>
            <ul class="mt-3 space-y-3 text-sm">
              <li class="flex gap-3">
                <span class="badge badge-warning w-12 shrink-0 justify-center font-mono">6.9</span>
                <span class="min-w-0 flex-1">
                  No settled-document history, or the live balance is over its limit.
                </span>
                @if (appliedCap() === 6.9) {
                  <span class="badge badge-warning badge-sm shrink-0">Applies now</span>
                }
              </li>
              <li class="flex gap-3">
                <span class="badge badge-error w-12 shrink-0 justify-center font-mono">4.9</span>
                <span class="min-w-0 flex-1">
                  Debt over 30 days is at least 10% of the larger of balance or limit.
                </span>
                @if (appliedCap() === 4.9) {
                  <span class="badge badge-error badge-sm shrink-0">Applies now</span>
                }
              </li>
              <li class="flex gap-3">
                <span class="badge badge-error w-12 shrink-0 justify-center font-mono">2.9</span>
                <span class="min-w-0 flex-1">
                  Debt over 60 days is at least 25% of the larger of balance or limit.
                </span>
                @if (appliedCap() === 2.9) {
                  <span class="badge badge-error badge-sm shrink-0">Applies now</span>
                }
              </li>
            </ul>
            @if (appliedCap() === null) {
              <p class="mt-3 text-xs font-medium text-success">No safety cap applies now.</p>
            }
          </div>
        </section>

        <section class="rounded-box border border-base-300 p-4">
          <h3 class="section-title">Score bands</h3>
          <div class="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-5">
            <div class="rounded-box bg-error/15 p-2"><b class="block">0–2.9</b>High risk</div>
            <div class="rounded-box bg-error/10 p-2"><b class="block">3–4.9</b>Restricted</div>
            <div class="rounded-box bg-warning/15 p-2"><b class="block">5–6.9</b>Watch</div>
            <div class="rounded-box bg-success/10 p-2"><b class="block">7–8.4</b>Good</div>
            <div class="col-span-2 rounded-box bg-success/15 p-2 sm:col-span-1">
              <b class="block">8.5–10</b>Strong
            </div>
          </div>
          <p class="type-caption mt-3">
            Unrated means there are no settled documents and no overdue balance yet.
          </p>
        </section>

        <aside
          class="flex items-start gap-3 rounded-box border border-info/30 bg-info/10 p-4 text-sm"
        >
          <app-icon name="heroInformationCircle" class="mt-0.5 shrink-0 text-info" />
          <div>
            <p class="font-semibold">Evidence, not an automatic decision</p>
            <p class="mt-1 text-base-content/70">
              Corrective adjustments can change exposure but do not count as repayment performance.
              The score does not post to the ledger or automatically change credit terms.
            </p>
            <p class="mt-2 text-xs text-base-content/60">
              Confidence is provisional until there are at least 3 settled documents and 90 days of
              history.
            </p>
          </div>
        </aside>
      </div>

      <div taskFooter class="flex justify-end">
        <button appButton type="button" variant="primary" (click)="open.set(false)">Got it</button>
      </div>
    </app-task-dialog>
  `,
})
export class CreditScoreExplainerDialogComponent {
  readonly open = model(false);
  readonly profile = input.required<PartyCreditProfile>();
  protected readonly factors = SCORE_FACTORS;

  protected factorActive(key: ScoreFactorKey): boolean {
    const profile = this.profile();
    if (key === 'punctuality') return profile.punctuality !== null;
    if (key === 'overdue') return profile.balance > 0;
    if (key === 'utilization') return profile.credit_limit > 0;
    return profile.settled_documents >= 2;
  }

  protected factorStatus(key: ScoreFactorKey): string {
    const profile = this.profile();
    if (key === 'punctuality') {
      return profile.punctuality === null
        ? 'not included — no payment evidence'
        : `${this.percent(profile.punctuality)} timeliness signal`;
    }
    if (key === 'overdue') {
      return profile.balance <= 0
        ? 'not included — no live balance'
        : `${formatKes(profile.overdue_amount)} of ${formatKes(profile.balance)} overdue`;
    }
    if (key === 'utilization') {
      return profile.credit_limit <= 0 || profile.utilization === null
        ? 'not included — no credit limit'
        : `${this.percent(profile.utilization)} of the limit used`;
    }
    return profile.settled_documents >= 2
      ? 'included — recent and earlier payment timing compared'
      : `not included — ${profile.settled_documents} of 2 settled documents`;
  }

  protected appliedCap(): 2.9 | 4.9 | 6.9 | null {
    const profile = this.profile();
    const materialOverdue =
      profile.overdue_amount / Math.max(profile.balance, profile.credit_limit, 1);
    if (profile.oldest_overdue_days > 60 && materialOverdue >= 0.25) return 2.9;
    if (profile.oldest_overdue_days > 30 && materialOverdue >= 0.1) return 4.9;
    if (
      profile.settled_documents === 0 ||
      (profile.credit_limit > 0 && profile.balance > profile.credit_limit)
    ) {
      return 6.9;
    }
    return null;
  }

  private percent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }
}
