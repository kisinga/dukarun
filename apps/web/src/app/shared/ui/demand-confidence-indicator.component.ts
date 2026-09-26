import { Component, computed, input } from '@angular/core';
import type { DemandConfidence } from '../../core/product-performance.models';

/**
 * Compact evidence-strength meter. Decision severity keeps its own semantic
 * color; this indicator communicates how much repeat evidence supports it.
 */
@Component({
  selector: 'app-demand-confidence',
  host: { class: 'inline-flex' },
  template: `
    <span
      class="inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-semibold leading-none"
      [class]="toneClass()"
      [attr.aria-label]="ariaLabel()"
      [attr.title]="description()"
      [attr.data-confidence]="value()"
    >
      <span aria-hidden="true" class="flex h-3.5 items-end gap-0.5">
        <span class="h-1.5 w-1 rounded-sm bg-current" [class]="barOpacity(1)"></span>
        <span class="h-2.5 w-1 rounded-sm bg-current" [class]="barOpacity(2)"></span>
        <span class="h-3.5 w-1 rounded-sm bg-current" [class]="barOpacity(3)"></span>
      </span>
      <span>{{ label() }}</span>
    </span>
  `,
})
export class DemandConfidenceIndicatorComponent {
  readonly value = input.required<DemandConfidence>();

  protected readonly label = computed(() => {
    if (this.value() === 'high') return 'High';
    if (this.value() === 'medium') return 'Medium';
    return 'Low';
  });

  protected readonly ariaLabel = computed(() => `${this.label()} demand confidence`);
  protected readonly toneClass = computed(() => {
    if (this.value() === 'high') return 'border-success/60 bg-success/20 text-success';
    if (this.value() === 'medium') return 'border-info/40 bg-info/10 text-info';
    return 'border-warning/30 bg-warning/5 text-warning/80';
  });
  protected readonly description = computed(() => {
    if (this.value() === 'high') return 'High confidence: repeat demand across sufficient history.';
    if (this.value() === 'medium')
      return 'Medium confidence: useful evidence with limited history or an adjusted spike.';
    return 'Low confidence: limited history; reorder recommendations are conservatively capped.';
  });

  protected barOpacity(level: number): string {
    if (level > this.strength()) return 'opacity-20';
    if (this.value() === 'high') return 'opacity-100';
    if (this.value() === 'medium') return 'opacity-90';
    return 'opacity-70';
  }

  private strength(): number {
    if (this.value() === 'high') return 3;
    if (this.value() === 'medium') return 2;
    return 1;
  }
}
