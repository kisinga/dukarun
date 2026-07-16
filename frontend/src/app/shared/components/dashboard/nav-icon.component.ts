import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import type { NavIcon } from '../../../shell/layout/nav.types';

/**
 * Maps a semantic {@link NavIcon} key to a registered heroicons (outline) name.
 * Icons are registered once via `provideIcons(APP_ICONS)` in app.config.
 */
const NAV_ICON_MAP: Record<NavIcon, string> = {
  overview: 'heroChartBar',
  sell: 'heroShoppingCart',
  cashier: 'heroBanknotes',
  sales: 'heroClipboardDocumentList',
  payments: 'heroCreditCard',
  expenses: 'heroDocumentText',
  products: 'heroCube',
  credit: 'heroCreditCard',
  customers: 'heroUsers',
  suppliers: 'heroTruck',
  purchases: 'heroInboxStack',
  accounting: 'heroDocumentText',
  'stock-adjustments': 'heroAdjustmentsHorizontal',
  settings: 'heroCog6Tooth',
  admin: 'heroBuildingStorefront',
  upgrade: 'heroSparkles',
  approvals: 'heroCheckCircle',
};

@Component({
  selector: 'app-nav-icon',
  standalone: true,
  imports: [NgIcon],
  template: `<ng-icon [name]="mappedName()" size="1.25rem" class="shrink-0" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavIconComponent {
  readonly name = input.required<NavIcon>();
  protected readonly mappedName = computed(
    () => NAV_ICON_MAP[this.name()] ?? 'heroInformationCircle',
  );
}
