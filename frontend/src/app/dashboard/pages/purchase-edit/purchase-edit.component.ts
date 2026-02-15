import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { PurchaseService } from '../../../core/services/purchase.service';
import { SupplierService } from '../../../core/services/supplier.service';
import { PageHeaderComponent } from '../../components/shared/page-header.component';
import { CompanySearchSelectComponent } from '../shared/components/company-search-select.component';

@Component({
  selector: 'app-purchase-edit',
  standalone: true,
  imports: [CommonModule, RouterModule, PageHeaderComponent, CompanySearchSelectComponent],
  template: `
    <div class="space-y-4 sm:space-y-5 anim-stagger pb-20 lg:pb-6">
      <app-page-header
        title="Edit draft purchase"
        subtitle="Update supplier, reference, date, or notes"
        [showRefresh]="false"
      >
        <button actions type="button" (click)="goBack()" class="btn btn-ghost btn-sm">
          Cancel
        </button>
      </app-page-header>

      @if (error()) {
        <div class="alert alert-error text-sm">
          <span>{{ error() }}</span>
          <button (click)="error.set(null)" class="btn btn-ghost btn-xs">Dismiss</button>
        </div>
      }

      @if (isLoading()) {
        <div class="flex justify-center py-12">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      } @else if (purchase()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="w-full sm:col-span-2 lg:col-span-1">
            <app-company-search-select
              [items]="filteredSuppliers()"
              [selectedId]="supplierId()"
              [searchTerm]="supplierSearchTerm()"
              [placeholder]="'Search supplier...'"
              [isLoading]="false"
              [getLabel]="getSupplierLabel"
              [getSubtitle]="getSupplierSubtitle"
              (searchTermChange)="onSupplierSearchTermChange($event)"
              (select)="onSupplierSelect($event)"
              (clear)="onSupplierClear()"
            />
          </div>
          <input
            type="date"
            class="input input-bordered input-sm sm:input-md w-full"
            [value]="purchaseDateStr()"
            (change)="purchaseDateStr.set($any($event.target).value)"
          />
          <input
            type="text"
            class="input input-bordered input-sm sm:input-md w-full"
            placeholder="Reference"
            [value]="referenceNumber()"
            (input)="referenceNumber.set($any($event.target).value)"
          />
        </div>

        <textarea
          class="textarea textarea-bordered textarea-sm sm:textarea-md w-full"
          rows="2"
          placeholder="Notes (optional)"
          [value]="notes()"
          (input)="notes.set($any($event.target).value)"
        ></textarea>

        <div class="flex gap-2 pt-4">
          <button class="btn btn-primary" [disabled]="isSaving()" (click)="save()">
            @if (isSaving()) {
              <span class="loading loading-spinner loading-xs"></span>
            }
            Save changes
          </button>
          <a [routerLink]="['/dashboard/purchases']" class="btn btn-ghost">Back to list</a>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseEditComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly purchaseService = inject(PurchaseService);
  private readonly supplierService = inject(SupplierService);

  readonly purchase = signal<any | null>(null);
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly isSaving = signal(false);

  readonly supplierId = signal<string | null>(null);
  readonly supplierSearchTerm = signal('');
  readonly purchaseDateStr = signal('');
  readonly referenceNumber = signal('');
  readonly notes = signal('');

  readonly suppliers = this.supplierService.suppliers;
  readonly filteredSuppliers = computed(() => {
    const list = this.suppliers();
    const term = this.supplierSearchTerm().trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (s: any) =>
        (s.firstName ?? '').toLowerCase().includes(term) ||
        (s.lastName ?? '').toLowerCase().includes(term) ||
        (s.emailAddress ?? '').toLowerCase().includes(term),
    );
  });

  ngOnInit(): void {
    this.supplierService.fetchSuppliers({ take: 100, skip: 0 });
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadPurchase(id);
    } else {
      this.error.set('Missing purchase ID');
      this.isLoading.set(false);
    }
  }

  private async loadPurchase(id: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const p = await this.purchaseService.fetchPurchaseById(id);
      this.purchase.set(p);
      if (p) {
        this.supplierId.set(p.supplierId);
        this.referenceNumber.set(p.referenceNumber ?? '');
        this.notes.set(p.notes ?? '');
        const d = p.purchaseDate ? new Date(p.purchaseDate) : new Date();
        this.purchaseDateStr.set(d.toISOString().slice(0, 10));
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to load purchase');
    } finally {
      this.isLoading.set(false);
    }
  }

  getSupplierLabel = (s: { firstName?: string; lastName?: string }): string =>
    [s.firstName, s.lastName].filter(Boolean).join(' ') || '';
  getSupplierSubtitle = (s: { emailAddress?: string }): string => s.emailAddress ?? '';

  onSupplierSearchTermChange(value: string): void {
    this.supplierSearchTerm.set(value);
    this.supplierId.set(null);
  }
  onSupplierSelect(supplier: { id: string }): void {
    this.supplierId.set(supplier.id);
  }
  onSupplierClear(): void {
    this.supplierSearchTerm.set('');
    this.supplierId.set(null);
  }

  async save(): Promise<void> {
    const p = this.purchase();
    const id = p?.id;
    if (!id) return;

    this.isSaving.set(true);
    this.error.set(null);
    try {
      const input: any = {
        referenceNumber: this.referenceNumber() || null,
        notes: this.notes() || null,
      };
      const sid = this.supplierId();
      if (sid) input.supplierId = sid;
      const dateStr = this.purchaseDateStr();
      if (dateStr) input.purchaseDate = new Date(dateStr).toISOString();

      await this.purchaseService.updateDraftPurchase(id, input);
      this.router.navigate(['/dashboard/purchases']);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to save');
    } finally {
      this.isSaving.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard/purchases']);
  }
}
