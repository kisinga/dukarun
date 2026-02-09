import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { EntityAvatarComponent } from '../../../components/shared/entity-avatar.component';
import { StatusBadgeComponent } from '../../../components/shared/status-badge.component';

export type SupplierAction = 'view' | 'edit' | 'delete' | 'recordPayment';

@Component({
  selector: 'app-supplier-card',
  imports: [CommonModule, EntityAvatarComponent, StatusBadgeComponent],
  templateUrl: './supplier-card.component.html',
  styleUrl: './supplier-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierCardComponent {
  supplier = input.required<any>();
  action = output<{ action: SupplierAction; supplierId: string }>();

  onAction(action: SupplierAction): void {
    this.action.emit({ action, supplierId: this.supplier().id });
  }

  getFullName(): string {
    const s = this.supplier();
    return `${s.firstName || ''} ${s.lastName || ''}`.trim();
  }

  getInitials(): string {
    const s = this.supplier();
    const first = s.firstName?.charAt(0) || '';
    const last = s.lastName?.charAt(0) || '';
    return (first + last).toUpperCase();
  }

  getAddressCount(): number {
    return this.supplier().addresses?.length || 0;
  }

  isVerified(): boolean {
    return this.supplier().user?.verified || false;
  }

  getCreatedDate(): string {
    return new Date(this.supplier().createdAt).toLocaleDateString();
  }

  getSupplierCode(): string {
    return this.supplier().customFields?.supplierCode || 'N/A';
  }

  getSupplierType(): string {
    return this.supplier().customFields?.supplierType || 'General';
  }
}
