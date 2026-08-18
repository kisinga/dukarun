import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { PaginationComponent } from '../shared/ui/pagination.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import { WorkspaceNavigationComponent } from '../shared/ui/workspace-navigation.component';

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
    PaginationComponent,
    PageActionsComponent,
    WorkspaceNavigationComponent,
  ],
  template: `
    <app-page
      title="Inventory"
      subtitle="Move stock between business locations without changing company inventory value."
      [wide]="true"
    >
      @if (locations.isMultiLocation()) {
        <app-page-actions actions>
          <button
            primaryAction
            appButton
            type="button"
            class="lg:hidden"
            (click)="editorOpen.set(true)"
          >
            <app-icon name="heroPlus" /> New transfer
          </button>
        </app-page-actions>
      }
      <app-workspace-navigation workspace="inventory" label="Inventory" />

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

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,.8fr)]">
          <section
            class="stock-transfer-editor order-2 card bg-base-100 lg:order-1"
            [class.stock-transfer-editor-open]="editorOpen()"
          >
            <div class="card-body p-4 sm:p-6">
              <div class="flex items-center justify-between gap-3">
                <h2 class="section-title">New transfer</h2>
                <button
                  appButton
                  variant="ghost"
                  [iconOnly]="true"
                  type="button"
                  class="lg:hidden"
                  aria-label="Cancel transfer"
                  (click)="editorOpen.set(false)"
                >
                  <app-icon name="heroXMark" />
                </button>
              </div>
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
                <div class="mt-4 divide-y divide-base-200 rounded-box border border-base-300">
                  @for (line of lines(); track line.variant.variant_id) {
                    <div
                      class="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-center"
                    >
                      <div class="min-w-0">
                        <p class="font-medium">{{ label(line.variant) }}</p>
                        <p class="type-caption">
                          {{ line.variant.manufacturer_name || 'Manufacturer not set' }} ·
                          {{ line.variant.sku }} · {{ quantity(line.variant.stock ?? 0) }} available
                        </p>
                      </div>
                      <div>
                        <label class="type-caption mb-1 block sm:hidden">Quantity</label>
                        <input
                          type="number"
                          min="0.001"
                          [max]="line.variant.stock ?? 0"
                          [step]="line.variant.allow_fractional ? '0.001' : '1'"
                          class="input input-bordered input-sm w-full"
                          [value]="line.quantity"
                          (input)="setQuantity(line.variant.variant_id!, $event)"
                        />
                      </div>
                      <div class="text-right">
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          (click)="removeLine(line.variant.variant_id!)"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }

              <app-form-field label="Notes" hint="Optional transfer reference." class="mt-4">
                <input type="text" class="input input-bordered w-full" [formControl]="notes" />
              </app-form-field>
              <div class="stock-transfer-actions mt-4 flex justify-end gap-2">
                <button
                  appButton
                  variant="ghost"
                  type="button"
                  class="lg:hidden"
                  (click)="editorOpen.set(false)"
                >
                  Cancel
                </button>
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

          <section class="order-1 card h-fit bg-base-100 lg:order-2">
            <div class="card-body p-4">
              <div class="flex items-center justify-between gap-2">
                <h2 class="section-title">Transfer history</h2>
                <button
                  appButton
                  variant="ghost"
                  [iconOnly]="true"
                  type="button"
                  [loading]="loading()"
                  title="Refresh transfer history"
                  aria-label="Refresh transfer history"
                  (click)="loadHistory()"
                >
                  <app-icon name="heroArrowPath" />
                </button>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2">
                <app-form-field label="From location">
                  <select
                    class="select select-bordered select-sm w-full"
                    [value]="historyFromLocation()"
                    (change)="setHistoryLocation('from', $event)"
                  >
                    <option value="">Any</option>
                    @for (location of locations.locations(); track location.id) {
                      <option [value]="location.id">{{ location.name }}</option>
                    }
                  </select>
                </app-form-field>
                <app-form-field label="To location">
                  <select
                    class="select select-bordered select-sm w-full"
                    [value]="historyToLocation()"
                    (change)="setHistoryLocation('to', $event)"
                  >
                    <option value="">Any</option>
                    @for (location of locations.locations(); track location.id) {
                      <option [value]="location.id">{{ location.name }}</option>
                    }
                  </select>
                </app-form-field>
                <app-form-field label="From"
                  ><input
                    type="date"
                    class="input input-bordered input-sm w-full"
                    [value]="historyFrom()"
                    (change)="setHistoryDate('from', $event)"
                /></app-form-field>
                <app-form-field label="To"
                  ><input
                    type="date"
                    class="input input-bordered input-sm w-full"
                    [value]="historyTo()"
                    (change)="setHistoryDate('to', $event)"
                /></app-form-field>
              </div>
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
                      <p class="type-caption mt-1">
                        {{ transfer.stock_transfer_lines.length }} item(s) ·
                        {{ transferQuantity(transfer) }} units
                      </p>
                      @for (
                        line of transfer.stock_transfer_lines.slice(0, 2);
                        track line.variant_id
                      ) {
                        <p class="mt-1 truncate text-xs">
                          {{ transferLineLabel(line) }} · {{ quantity(line.quantity) }}
                        </p>
                      }
                    </div>
                  }
                </div>
                <app-pagination
                  class="mt-3 block"
                  [currentPage]="historyPage()"
                  [totalPages]="historyTotalPages()"
                  [totalItems]="historyTotal()"
                  [itemsPerPage]="historyPageSize"
                  itemLabel="transfers"
                  (pageChange)="changeHistoryPage($event)"
                />
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
  protected readonly historyPage = signal(1);
  protected readonly historyTotal = signal(0);
  protected readonly historyPageSize = 10;
  protected readonly historyFromLocation = signal('');
  protected readonly historyToLocation = signal('');
  protected readonly historyFrom = signal(this.daysAgoIso(29));
  protected readonly historyTo = signal(this.todayIso());
  protected readonly historyTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.historyTotal() / this.historyPageSize))
  );
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly editorOpen = signal(false);
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
  private readonly debouncedSearch = toSignal(
    this.search.valueChanges.pipe(debounceTime(200), distinctUntilChanged()),
    { initialValue: undefined }
  );
  private historyLoadSequence = 0;

  constructor() {
    effect(() => {
      const query = this.debouncedSearch();
      if (query === undefined) return;
      untracked(() => void this.find(query));
    });
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
      this.editorOpen.set(false);
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

  protected async loadHistory(): Promise<void> {
    if (!this.locations.isMultiLocation()) return;
    const sequence = ++this.historyLoadSequence;
    this.loading.set(true);
    try {
      const result = await this.transfers.page({
        page: this.historyPage(),
        pageSize: this.historyPageSize,
        fromLocationId: this.historyFromLocation() || undefined,
        toLocationId: this.historyToLocation() || undefined,
        from: this.historyFrom() || undefined,
        to: this.historyTo() || undefined,
      });
      if (sequence !== this.historyLoadSequence) return;
      this.history.set(result.rows);
      this.historyTotal.set(result.count);
    } catch (err) {
      if (sequence === this.historyLoadSequence)
        this.error.set(err instanceof Error ? err.message : 'Failed to load transfers');
    } finally {
      if (sequence === this.historyLoadSequence) this.loading.set(false);
    }
  }

  protected changeHistoryPage(page: number): void {
    this.historyPage.set(page);
    void this.loadHistory();
  }

  protected transferQuantity(transfer: StockTransferListRow): string {
    return this.quantity(
      transfer.stock_transfer_lines.reduce((sum, line) => sum + Number(line.quantity), 0)
    );
  }

  protected transferLineLabel(line: StockTransferListRow['stock_transfer_lines'][number]): string {
    const variant = line.product_variants;
    return [variant?.products?.name, variant?.name].filter(Boolean).join(' · ') || 'Product';
  }

  protected setHistoryLocation(kind: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    kind === 'from' ? this.historyFromLocation.set(value) : this.historyToLocation.set(value);
    this.reloadHistory();
  }

  protected setHistoryDate(kind: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    kind === 'from' ? this.historyFrom.set(value) : this.historyTo.set(value);
    this.reloadHistory();
  }

  private reloadHistory(): void {
    this.historyPage.set(1);
    void this.loadHistory();
  }

  private todayIso(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  }

  private daysAgoIso(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  }
}
