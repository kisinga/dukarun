import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { HoverPreviewHostComponent } from '../../../../shared/components/dashboard/hover-preview-host/hover-preview-host.component';

/**
 * Purchase Supplier Info Component
 *
 * Displays supplier name (link to supplier detail), email, and phone
 */
@Component({
  selector: 'app-purchase-supplier-info',
  imports: [CommonModule, RouterLink, NgIcon, HoverPreviewHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <h3 class="font-bold text-base mb-3 text-base-content">Supplier</h3>
      @if (supplier()?.id) {
        <app-hover-preview-host previewKey="supplier" [entityId]="supplier()!.id">
          <a
            [routerLink]="['/dashboard/suppliers', supplier()!.id]"
            class="link link-hover text-base font-medium text-base-content mb-2 inline-block"
            >{{ supplierName() }}</a
          >
        </app-hover-preview-host>
      } @else {
        <p class="text-base font-medium text-base-content mb-2">{{ supplierName() }}</p>
      }
      @if (supplier()) {
        <div class="space-y-1">
          @if (supplier()!.emailAddress) {
            <div class="flex items-center gap-2 text-sm text-base-content/70">
              <ng-icon name="heroEnvelope" size="1rem" class="shrink-0" />
              <span>{{ supplier()!.emailAddress }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PurchaseSupplierInfoComponent {
  readonly supplier = input<{
    id: string;
    firstName?: string;
    lastName?: string;
    emailAddress?: string;
  } | null>(null);

  readonly supplierName = computed(() => {
    const supp = this.supplier();
    if (!supp) return 'Unknown Supplier';
    const firstName = supp.firstName || '';
    const lastName = supp.lastName || '';
    return `${firstName} ${lastName}`.trim() || supp.emailAddress || 'Unknown Supplier';
  });
}
