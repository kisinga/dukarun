import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { LocationContextService } from '../core/location-context.service';
import { CatalogSearchService } from '../core/catalog-search.service';
import { Variant, variantLabel } from '../pos/pos.service';
import { SyncService } from '../pos/offline/sync.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StockTransferListRow, StockTransfersService } from './stock-transfers.service';

interface TransferLine {
  variant: Variant;
  quantity: number;
}

@Component({
  selector: 'app-stock-transfers',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    ButtonComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
    PageLayoutComponent,
  ],
  template: `
    <app-page
      title="Stock transfers"
      subtitle="Move stock between business locations without changing company inventory value."
      [wide]="true"
    >
      @if (!locations.isMultiLocation()) {
        <app-empty-state
          icon="heroArrowsRightLeft"
          title="One location needs no transfers"
          description="Add another business location when you need to hold stock elsewhere."
        >
          <a actions routerLink="/settings" class="btn btn-primary">Business locations</a>
        </app-empty-state>
      } @else {
        @if (error()) {
          <div class="alert alert-error mb-4 text-sm" role="alert">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ error() }}</span>
          </div>
        }
        @if (notice()) {
          <div class="alert alert-success mb-4 text-sm" role="status">
            <app-icon name="heroCheckCircle" />
            <span>{{ notice() }}</span>
          </div>
        }

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,.8fr)]">
          <section class="card bg-base-100">
            <div class="card-body p-4 sm:p-6">
              <h2 class="section-title">New transfer</h2>
              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <app-form-field label="From">
                  <div
                    class="flex min-h-11 items-center rounded-field bg-base-200 px-3 text-sm font-medium"
                  >
                    {{ locations.active()?.name }}
                  </div>
                </app-form-field>
                <app-form-field label="To" [required]="true">
                  <select class="select select-bordered w-full" [formControl]="destination">
                    <option value="">Choose destination</option>
                    @for (location of destinations(); track location.id) {
                      <option [value]="location.id">{{ location.name }}</option>
                    }
                  </select>
                </app-form-field>
              </div>

              <app-form-field label="Add product" class="mt-4">
                <input
                  type="search"
                  class="input input-bordered w-full"
                  placeholder="Search product, manufacturer, SKU, or barcode"
                  [formControl]="search"
                />
              </app-form-field>
              @if (searchError()) {
                <p class="mt-1 text-sm text-error">{{ searchError() }}</p>
              }
              @if (results().length > 0) {
                <div class="mt-2 max-h-56 overflow-auto rounded-box border border-base-300">
                  @for (variant of results(); track variant.variant_id) {
                    <button
                      type="button"
                      class="flex min-h-12 w-full items-center gap-3 border-b border-base-200 px-3 text-left last:border-0 hover:bg-base-200"
                      [disabled]="Number(variant.stock ?? 0) <= 0"
                      (click)="addLine(variant)"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium">{{ label(variant) }}</span>
                        <span class="type-caption block truncate">
                          {{ variant.manufacturer_name || 'Manufacturer not set' }} ·
                          {{ variant.sku }}
                        </span>
                      </span>
                      <span class="type-caption">{{ quantity(variant.stock ?? 0) }} available</span>
                    </button>
                  }
                </div>
              }

              @if (lines().length > 0) {
                <div class="table-scroll mt-4 rounded-box border border-base-300">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th class="w-32">Quantity</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (line of lines(); track line.variant.variant_id) {
                        <tr>
                          <td>
                            <p class="font-medium">{{ label(line.variant) }}</p>
                            <p class="type-caption">
                              {{ line.variant.manufacturer_name || 'Manufacturer not set' }} ·
                              {{ line.variant.sku }} ·
                              {{ quantity(line.variant.stock ?? 0) }} available
                            </p>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0.001"
                              [max]="line.variant.stock ?? 0"
                              [step]="line.variant.allow_fractional ? '0.001' : '1'"
                              class="input input-bordered input-sm w-28"
                              [value]="line.quantity"
                              (input)="setQuantity(line.variant.variant_id!, $event)"
                            />
                          </td>
                          <td class="text-right">
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              type="button"
                              (click)="removeLine(line.variant.variant_id!)"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }

              <app-form-field label="Notes" hint="Optional transfer reference." class="mt-4">
                <input type="text" class="input input-bordered w-full" [formControl]="notes" />
              </app-form-field>
              <div class="mt-4 flex justify-end">
                <button
                  appButton
                  type="button"
                  [loading]="saving()"
                  [disabled]="!canSubmit()"
                  (click)="submit()"
                >
                  Transfer stock
                </button>
              </div>
            </div>
          </section>

          <section class="card h-fit bg-base-100">
            <div class="card-body p-4">
              <h2 class="section-title">Recent transfers</h2>
              @if (!loading() && history().length === 0) {
                <app-empty-state
                  [embedded]="true"
                  [compact]="true"
                  icon="heroArrowsRightLeft"
                  title="No transfers yet"
                  description="Completed transfers appear here."
                />
              } @else {
                <div class="mt-2 divide-y divide-base-200">
                  @for (transfer of history(); track transfer.id) {
                    <div class="py-3">
                      <div class="flex items-center gap-2 text-sm font-medium">
                        <span>{{ transfer.from_location?.name ?? 'Unknown' }}</span>
                        <app-icon name="heroArrowRight" size="sm" />
                        <span>{{ transfer.to_location?.name ?? 'Unknown' }}</span>
                      </div>
                      <p class="type-caption mt-1">{{ transfer.created_at | date: 'medium' }}</p>
                    </div>
                  }
                </div>
              }
            </div>
          </section>
        </div>
      }
    </app-page>
  `,
})
export class StockTransfersComponent implements OnInit {
  private readonly transfers = inject(StockTransfersService);
  private readonly catalogSearch = inject(CatalogSearchService);
  private readonly sync = inject(SyncService);
  protected readonly locations = inject(LocationContextService);
  protected readonly Number = Number;
  protected readonly label = variantLabel;

  protected readonly destination = new FormControl('', { nonNullable: true });
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly notes = new FormControl('', { nonNullable: true });
  protected readonly results = signal<Variant[]>([]);
  protected readonly searchError = signal<string | null>(null);
  protected readonly lines = signal<TransferLine[]>([]);
  protected readonly history = signal<StockTransferListRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly destinations = computed(() =>
    this.locations.locations().filter(location => location.id !== this.locations.activeId())
  );
  protected readonly canSubmit = computed(
    () =>
      !!this.destination.value &&
      this.lines().length > 0 &&
      this.lines().every(
        line => line.quantity > 0 && line.quantity <= Number(line.variant.stock ?? 0)
      ) &&
      !this.saving()
  );

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(value => void this.find(value));
  }

  async ngOnInit(): Promise<void> {
    if (this.locations.locations().length === 0) await this.locations.load();
    await this.loadHistory();
  }

  protected addLine(variant: Variant): void {
    if (
      !variant.variant_id ||
      this.lines().some(line => line.variant.variant_id === variant.variant_id)
    )
      return;
    this.lines.update(lines => [...lines, { variant, quantity: 1 }]);
    this.search.setValue('', { emitEvent: false });
    this.results.set([]);
  }

  protected removeLine(variantId: string): void {
    this.lines.update(lines => lines.filter(line => line.variant.variant_id !== variantId));
  }

  protected setQuantity(variantId: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.lines.update(lines =>
      lines.map(line =>
        line.variant.variant_id === variantId ? { ...line, quantity: value } : line
      )
    );
  }

  protected quantity(value: number): string {
    return Number(value).toLocaleString('en-KE', { maximumFractionDigits: 3 });
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.transfers.transfer(
        this.locations.requireActiveId(),
        this.destination.value,
        this.lines().map(line => ({
          variant_id: line.variant.variant_id!,
          quantity: line.quantity,
        })),
        this.notes.value
      );
      this.lines.set([]);
      this.notes.setValue('');
      this.notice.set('Stock transferred');
      await Promise.all([this.loadHistory(), this.sync.refreshProductSnapshot()]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      this.saving.set(false);
    }
  }

  private async find(value: string): Promise<void> {
    const query = value.trim();
    if (query.length < 2) {
      this.results.set([]);
      return;
    }
    try {
      const result = await this.catalogSearch.search(query, 20);
      this.results.set(result.variants.filter(variant => variant.kind !== 'service'));
      this.searchError.set(null);
    } catch {
      this.results.set([]);
      this.searchError.set('Search failed — check your connection and try again.');
    }
  }

  private async loadHistory(): Promise<void> {
    if (!this.locations.isMultiLocation()) return;
    this.loading.set(true);
    try {
      this.history.set(await this.transfers.recent());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load transfers');
    } finally {
      this.loading.set(false);
    }
  }
}
