import { Component, computed, input } from '@angular/core';
import { CREDIT_BAND_LABELS, type CreditBand, type CreditConfidence } from './insights.models';

@Component({
  selector: 'app-score-badge',
  template: `
    <span
      class="badge gap-1 whitespace-nowrap"
      [class.badge-success]="band() === 'strong' || band() === 'good'"
      [class.badge-warning]="band() === 'watch'"
      [class.badge-error]="band() === 'restricted' || band() === 'high_risk'"
      [class.badge-ghost]="band() === 'unrated'"
      [attr.aria-label]="ariaLabel()"
    >
      @if (score() !== null) {
        <span class="font-semibold tabular-nums">{{ score()!.toFixed(1) }}</span>
        <span aria-hidden="true">·</span>
      }
      {{ label() }}
    </span>
  `,
})
export class ScoreBadgeComponent {
  readonly score = input<number | null>(null);
  readonly band = input.required<CreditBand>();
  readonly confidence = input<CreditConfidence>('unrated');
  protected readonly label = computed(() => CREDIT_BAND_LABELS[this.band()]);
  protected readonly ariaLabel = computed(
    () =>
      `${this.label()} credit profile${this.score() === null ? '' : `, score ${this.score()} out of 10`}, ${this.confidence()} confidence`
  );
}
