import { Injectable, inject } from '@angular/core';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { LocationContextService } from '../core/location-context.service';
import { SupabaseService } from '../core/supabase.service';
import { createExcelWorkbook } from '../shared/excel-workbook';
import { exportProductWorkbook } from './product-workbook-export';
import { readBaseline, readProductWorkbook } from './product-workbook-read';
import {
  MAX_FILE_BYTES,
  MAX_ROWS,
  type ProductWorkbookPreview,
  type ProductWorkbookResult,
  type WorkbookSnapshot,
} from './product-workbook';
export type { ProductWorkbookPreview, ProductWorkbookResult } from './product-workbook';

@Injectable({ providedIn: 'root' })
export class ProductTransferService {
  private readonly supabase = inject(SupabaseService);
  private readonly catalogCache = inject(CatalogCacheService);
  private readonly locations = inject(LocationContextService);

  private identity(): string {
    const identity = this.supabase.offlineIdentity();
    return `${identity?.companyId}/${identity?.userId}/${this.locations.active()?.id}`;
  }

  private async snapshot(): Promise<WorkbookSnapshot> {
    const location = this.locations.active();
    if (!location) throw new Error('Choose a stock location before using a Products workbook.');
    const identity = this.identity();
    const { data, error } = await this.supabase.client.rpc('product_workbook_snapshot', {
      p_location_id: location.id,
    });
    if (error) throw new Error(error.message);
    if (identity !== this.identity())
      throw new Error('Your shop or location changed. Download a fresh workbook.');
    return data as unknown as WorkbookSnapshot;
  }

  async exportCatalog(): Promise<void> {
    const identity = this.identity();
    const snapshot = await this.snapshot();
    const workbook = await exportProductWorkbook(snapshot, MAX_ROWS);
    const buffer = await workbook.xlsx.writeBuffer();
    if (buffer.byteLength > MAX_FILE_BYTES)
      throw new Error(
        'This catalogue exceeds the 10 MB workbook limit. Export a smaller catalogue.'
      );
    if (identity !== this.identity())
      throw new Error('Your shop or location changed. Export again.');
    const blob = new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Products-${snapshot.location.code}-${snapshot.exported_at.slice(0, 10)}.xlsx`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async preview(file: File): Promise<ProductWorkbookPreview> {
    if (file.size > MAX_FILE_BYTES) throw new Error('Workbook must be 10 MB or smaller.');
    const identity = this.identity();
    const workbook = await createExcelWorkbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    readBaseline(workbook); // Reject old formats before making any catalogue requests.
    const live = await this.snapshot();
    if (identity !== this.identity())
      throw new Error('Your shop or location changed. Upload the correct workbook again.');
    return readProductWorkbook(workbook, file.name, live);
  }

  async apply(preview: ProductWorkbookPreview): Promise<ProductWorkbookResult> {
    if (preview.errors.length || preview.conflicts.length)
      throw new Error('Fix workbook errors before applying.');
    if (!preview.lines.length) throw new Error('Workbook has no changes.');
    if (
      preview.changes.company_id !== this.supabase.offlineIdentity()?.companyId ||
      preview.changes.location_id !== this.locations.active()?.id
    )
      throw new Error('Your shop or location changed. Review the workbook again.');
    const { data, error } = await this.supabase.client.rpc('apply_product_workbook', {
      p_request_id: preview.requestId,
      p_changes: preview.changes as never,
    });
    if (error) {
      if (/stale|stock_changed/.test(error.message))
        throw new Error(
          'Catalogue or stock changed after export. Download a fresh workbook and review your edits.'
        );
      throw new Error(error.message);
    }
    // A refresh failure must not turn a committed apply into an apparent failed write.
    void this.catalogCache.refresh().catch(() => undefined);
    return data as unknown as ProductWorkbookResult;
  }
}
