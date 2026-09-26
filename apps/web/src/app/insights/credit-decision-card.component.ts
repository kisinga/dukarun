import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { formatKes } from '../core/money';
import { ScoreBadgeComponent } from './score-badge.component';
import { insightCopy, type CreditDecisionCard } from './insights.models';

@Component({
  selector: 'app-credit-decision-card',
  imports: [DatePipe, ScoreBadgeComponent],
  template: `
    <article
      class="rounded-box border border-base-300 bg-base-100 p-3"
      aria-label="Credit decision summary"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <app-score-badge
          [score]="summary().score"
          [band]="summary().band"
          [confidence]="summary().confidence"
        />
        <span class="type-caption">
          @if (summary().scoreTimestamp) {
            Updated {{ summary().scoreTimestamp | date: 'MMM d, h:mm a' }}
          } @else {
            Updating
          }
        </span>
      </div>
      <p class="mt-2 text-sm">{{ mainReason() }}</p>
      <p class="type-caption mt-1">{{ recommendation() }}</p>
      @if (summary().balance !== undefined) {
        <dl class="mt-3 grid grid-cols-2 gap-2 border-t border-base-200 pt-3 text-sm">
          <div>
            <dt class="type-caption">Live balance</dt>
            <dd class="font-semibold">{{ fmt(summary().balance!) }}</dd>
          </div>
          <div>
            <dt class="type-caption">Available</dt>
            <dd class="font-semibold">
              {{
                summary().availableCredit === null
                  ? 'No limit'
                  : fmt(summary().availableCredit ?? 0)
              }}
            </dd>
          </div>
        </dl>
      }
    </article>
  `,
})
export class CreditDecisionCardComponent {
  readonly summary = input.required<CreditDecisionCard>();
  protected readonly mainReason = computed(() => insightCopy(this.summary().reasonCodes[0]));
  protected readonly recommendation = computed(() =>
    insightCopy(this.summary().recommendationCode)
  );
  protected readonly fmt = formatKes;
}
