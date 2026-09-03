import { Component, computed, inject, signal } from '@angular/core';
import { PermissionsService } from '../core/permissions.service';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { PartyCacheService } from '../core/party-cache.service';
import { RecentSalesCacheService } from '../core/recent-sales-cache.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { ProductImportDialogComponent } from '../products/product-import-dialog.component';
import {
  ProductTransferService,
  type ProductWorkbookResult,
} from '../products/product-transfer.service';
import { CachedDataExportService, type CachedExportKind } from './cached-data-export.service';

@Component({
  selector: 'app-settings-data-transfer',
  imports: [ButtonComponent, IconComponent, ProductImportDialogComponent],
  template: `
    <div class="card bg-base-100">
      <div class="card-body gap-4 p-4">
        <div>
          <h2 class="section-title">Data import &amp; export</h2>
          <p class="type-caption mt-1">
            These files can contain private business and customer information. Store and share them
            carefully.
          </p>
        </div>

        <p class="type-caption flex items-start gap-1.5 text-info">
          <app-icon name="heroInformationCircle" size="sm" />
          <span>
            Exports use this device's fresh synchronized cache. Refresh the related screen first if
            you want to force a new snapshot before downloading.
          </span>
        </p>

        @if (dataMessage(); as message) {
          <div
            role="status"
            class="alert text-sm"
            [class.alert-success]="message.ok"
            [class.alert-error]="!message.ok"
          >
            <span>{{ message.text }}</span>
          </div>
        }

        <div class="grid gap-3 md:grid-cols-2">
          @if (perms.has('ManageCatalog')) {
            <section class="rounded-box border border-base-300 p-4">
              <div class="flex items-start gap-3">
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <app-icon name="heroArchiveBox" />
                </span>
                <div class="min-w-0 flex-1">
                  <h3 class="font-semibold">Update products &amp; stock</h3>
                  <p class="type-caption mt-1">
                    {{ catalogCache.families().length }} products ·
                    {{ catalogCache.catalog().length }} variants
                    @if (!catalogCache.loaded()) {
                      · not cached yet
                    } @else if (catalogCache.catalogTruncated()) {
                      · limited cache
                    }
                  </p>
                  <p class="mt-2 text-xs text-base-content/60">
                    Edit yellow cells, add rows for new products, or delete entire table rows to
                    disable them. Upload the same workbook to preview every change before applying
                    it.
                  </p>
                  @if (perms.has('ManageStockAdjustments') && perms.has('ViewFinancials')) {
                    <p class="mt-2 text-xs text-base-content/60">
                      The linked Batches sheet contains only batches with stock remaining. Latest
                      batch details are editable from the main sheet.
                    </p>
                  } @else {
                    <p class="mt-2 text-xs text-base-content/60">
                      Batch details are omitted unless your role includes stock-adjustment and
                      financial access.
                    </p>
                  }
                  <ol class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
                    <li>1. Download</li>
                    <li>2. Edit, add, or remove rows</li>
                    <li>3. Upload &amp; preview</li>
                  </ol>
                </div>
              </div>
              <div class="mt-4 flex flex-wrap gap-2">
                <button
                  appButton
                  variant="outline"
                  size="sm"
                  type="button"
                  [loading]="dataExportBusy() === 'catalog'"
                  [disabled]="dataExportBusy() !== null"
                  (click)="exportCatalog()"
                >
                  <app-icon name="heroArrowDownTray" /> Download editable workbook
                </button>
                <button
                  appButton
                  variant="secondary"
                  size="sm"
                  type="button"
                  [disabled]="dataExportBusy() !== null"
                  (click)="importOpen.set(true)"
                >
                  <app-icon name="heroArrowUpTray" /> Upload edited workbook
                </button>
              </div>
            </section>
          }

          @if (perms.has('ManageCustomers')) {
            <section class="rounded-box border border-base-300 p-4">
              <h3 class="font-semibold">Customers</h3>
              <p class="type-caption mt-1">
                {{ partyCache.customerRows().length }} cached customers
                @if (!partyCache.loaded()) {
                  · not cached yet
                } @else if (!partyCache.complete()) {
                  · partial cache
                }
              </p>
              <p class="mt-2 text-xs text-base-content/60">
                Excel with contact, credit and balance fields. Export only while a validated
                customer import workflow is not available.
              </p>
              <button
                appButton
                variant="outline"
                size="sm"
                class="mt-4"
                type="button"
                [loading]="dataExportBusy() === 'customers'"
                [disabled]="dataExportBusy() !== null"
                (click)="exportCached('customers')"
              >
                <app-icon name="heroArrowDownTray" /> Export Excel
              </button>
            </section>
          }

          @if (perms.has('ManageSupplierCreditPurchases')) {
            <section class="rounded-box border border-base-300 p-4">
              <h3 class="font-semibold">Suppliers</h3>
              <p class="type-caption mt-1">
                {{ partyCache.suppliers().length }} cached suppliers
                @if (!partyCache.loaded()) {
                  · not cached yet
                } @else if (!partyCache.complete()) {
                  · partial cache
                }
              </p>
              <p class="mt-2 text-xs text-base-content/60">
                Excel with contacts, payment terms and payable balances. Export only.
              </p>
              <button
                appButton
                variant="outline"
                size="sm"
                class="mt-4"
                type="button"
                [loading]="dataExportBusy() === 'suppliers'"
                [disabled]="dataExportBusy() !== null"
                (click)="exportCached('suppliers')"
              >
                <app-icon name="heroArrowDownTray" /> Export Excel
              </button>
            </section>
          }

          @if (perms.has('ViewFinancials')) {
            <section class="rounded-box border border-base-300 p-4">
              <h3 class="font-semibold">Recent sales</h3>
              <p class="type-caption mt-1">
                {{ recentSales.orders().length }} cached sales · current location
                @if (!recentSales.loaded()) {
                  · not cached yet
                }
              </p>
              <p class="mt-2 text-xs text-base-content/60">
                Excel of the latest cached sales (up to 100). Export only; this is a snapshot, not a
                complete accounting archive.
              </p>
              <button
                appButton
                variant="outline"
                size="sm"
                class="mt-4"
                type="button"
                [loading]="dataExportBusy() === 'recent-sales'"
                [disabled]="dataExportBusy() !== null"
                (click)="exportCached('recent-sales')"
              >
                <app-icon name="heroArrowDownTray" /> Export Excel
              </button>
            </section>
          }
        </div>

        @if (!canTransferData()) {
          <p class="type-caption">
            Your role does not include access to any available data exports.
          </p>
        }
      </div>
    </div>

    <app-product-import-dialog [(open)]="importOpen" (imported)="productImportCompleted($event)" />
  `,
})
export class SettingsDataTransferComponent {
  protected readonly productTransfer = inject(ProductTransferService);
  protected readonly cachedDataExport = inject(CachedDataExportService);
  protected readonly perms = inject(PermissionsService);
  protected readonly catalogCache = inject(CatalogCacheService);
  protected readonly partyCache = inject(PartyCacheService);
  protected readonly recentSales = inject(RecentSalesCacheService);

  protected readonly dataExportBusy = signal<'catalog' | CachedExportKind | null>(null);
  protected readonly dataMessage = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly importOpen = signal(false);
  protected readonly canTransferData = computed(
    () =>
      this.perms.has('ManageCatalog') ||
      this.perms.has('ManageCustomers') ||
      this.perms.has('ManageSupplierCreditPurchases') ||
      this.perms.has('ViewFinancials')
  );

  protected async exportCatalog(): Promise<void> {
    this.dataExportBusy.set('catalog');
    this.dataMessage.set(null);
    try {
      await this.productTransfer.exportCatalog();
      this.dataMessage.set({ ok: true, text: 'Editable products and stock workbook downloaded.' });
    } catch (err) {
      this.dataMessage.set({
        ok: false,
        text: err instanceof Error ? err.message : 'Product export failed.',
      });
    } finally {
      this.dataExportBusy.set(null);
    }
  }

  protected async exportCached(kind: CachedExportKind): Promise<void> {
    this.dataExportBusy.set(kind);
    this.dataMessage.set(null);
    try {
      const result = await this.cachedDataExport.export(kind);
      this.dataMessage.set({
        ok: true,
        text: `${result.rows} row${result.rows === 1 ? '' : 's'} exported to ${result.filename}.`,
      });
    } catch (err) {
      this.dataMessage.set({
        ok: false,
        text: err instanceof Error ? err.message : 'Export failed.',
      });
    } finally {
      this.dataExportBusy.set(null);
    }
  }

  protected async productImportCompleted(result: ProductWorkbookResult): Promise<void> {
    this.dataMessage.set({
      ok: true,
      text: `Workbook applied: ${result.created} products created · ${result.disabled_variants} variants disabled · ${result.disabled_products} products disabled · ${result.manufacturer_changes} manufacturers · ${result.retail_changes} retail · ${result.wholesale_changes} wholesale · ${result.stock_changes} stock · ${result.batches_created} batches created · ${result.batches_updated} batches updated.`,
    });
    await this.catalogCache.refresh();
  }
}
