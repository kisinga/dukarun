import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * One key-value entry in a detail-section KPI grid (e.g. Limit / Available / Terms).
 * `valueClass` is an optional full Tailwind literal (e.g. 'text-success') so it
 * survives the v4 purge — never interpolate it.
 */
export interface DetailStat {
  label: string;
  value: string;
  valueClass?: string;
}

/**
 * Shared section wrapper for entity-detail surfaces (modals + pages).
 *
 * One flat card surface with an icon + title header and a projected body —
 * replaces the ad-hoc `collapse`/emoji-header pattern that drifted between the
 * customer and supplier modals. Keeps every detail section structurally identical.
 *
 * Optional `[section-actions]` slot renders a control (e.g. Override) in the header.
 */
@Component({
  selector: 'app-detail-section',
  standalone: true,
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-box border border-base-300 bg-base-100">
      <div class="flex items-center gap-2 px-4 pt-3 pb-1.5">
        @if (icon(); as ic) {
          <ng-icon [name]="ic" class="text-base-content/60 shrink-0" />
        }
        <h4 class="text-sm font-semibold text-base-content flex-1">{{ title() }}</h4>
        <ng-content select="[section-actions]" />
      </div>
      <div class="px-4 pb-4">
        <ng-content />
      </div>
    </section>
  `,
})
export class DetailSectionComponent {
  readonly title = input.required<string>();
  /** ng-icon name, e.g. 'heroWallet'. Must be registered in APP_ICONS. */
  readonly icon = input<string>();
}
