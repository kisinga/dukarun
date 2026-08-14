import { Injectable, inject } from '@angular/core';
import type { Workbook, Worksheet } from 'exceljs';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { PartyCacheService } from '../core/party-cache.service';
import { RecentSalesCacheService } from '../core/recent-sales-cache.service';
import { createExcelWorkbook } from '../shared/excel-workbook';

export type CachedExportKind = 'inventory' | 'customers' | 'suppliers' | 'recent-sales';

export interface CachedExportResult {
  filename: string;
  rows: number;
}

type ExportValue = string | number | boolean | null | undefined;

@Injectable({ providedIn: 'root' })
export class CachedDataExportService {
  private readonly catalog = inject(CatalogCacheService);
  private readonly parties = inject(PartyCacheService);
  private readonly recentSales = inject(RecentSalesCacheService);

  async export(kind: CachedExportKind): Promise<CachedExportResult> {
    switch (kind) {
      case 'inventory':
        await this.requireLoaded(this.catalog.ensureLoaded(), () => this.catalog.loaded());
        return this.download(
          'inventory',
          [
            'product_id',
            'variant_id',
            'product_name',
            'variant_name',
            'sku',
            'barcode',
            'kind',
            'retail_price_kes',
            'wholesale_price_kes',
            'track_inventory',
            'quantity',
            'stock_value_kes',
            'manufacturer',
            'product_active',
            'variant_active',
          ],
          this.catalog.catalog().map(row => {
            const stock = row.variant_id ? this.catalog.stock().get(row.variant_id) : undefined;
            return [
              row.product_id,
              row.variant_id,
              row.product_name,
              row.variant_name === 'Default' ? '' : row.variant_name,
              row.sku,
              row.barcode,
              row.kind,
              row.price,
              row.wholesale_price,
              row.track_inventory,
              stock?.stock ?? row.stock,
              stock?.stock_value,
              row.manufacturer_name,
              row.product_active,
              row.variant_active,
            ];
          })
        );
      case 'customers':
        await this.requireLoaded(this.parties.ensureLoaded(), () => this.parties.loaded());
        return this.download(
          'customers',
          [
            'id',
            'first_name',
            'last_name',
            'phone',
            'email',
            'credit_limit_kes',
            'credit_terms_days',
            'credit_approved',
            'accounts_receivable_kes',
            'downpayment_balance_kes',
            'net_balance_kes',
            'days_outstanding',
            'aging_bucket',
            'notifications_enabled',
            'notes',
            'created_at',
            'updated_at',
          ],
          this.parties
            .customerRows()
            .map(row => [
              row.id,
              row.first_name,
              row.last_name,
              row.phone,
              row.email,
              row.credit_limit,
              row.credit_terms_days,
              row.is_credit_approved,
              row.ar_balance,
              row.downpayment_balance,
              row.net_balance,
              row.days_outstanding,
              row.bucket,
              row.notifications_enabled,
              row.notes,
              row.created_at,
              row.updated_at,
            ])
        );
      case 'suppliers':
        await this.requireLoaded(this.parties.ensureLoaded(), () => this.parties.loaded());
        return this.download(
          'suppliers',
          [
            'id',
            'name',
            'phone',
            'email',
            'active',
            'payment_terms',
            'credit_limit_kes',
            'credit_terms_days',
            'accounts_payable_kes',
            'days_outstanding',
            'aging_bucket',
            'notes',
            'created_at',
            'updated_at',
          ],
          this.parties
            .suppliers()
            .map(row => [
              row.id,
              [row.first_name, row.last_name].filter(Boolean).join(' '),
              row.phone,
              row.email,
              row.supplier_active,
              row.payment_terms,
              row.supplier_credit_limit,
              row.supplier_credit_terms_days,
              row.ap_balance,
              row.days_outstanding,
              row.bucket,
              row.notes,
              row.created_at,
              row.updated_at,
            ])
        );
      case 'recent-sales':
        await this.requireLoaded(this.recentSales.ensureLoaded(), () => this.recentSales.loaded());
        return this.download(
          'recent-sales',
          [
            'id',
            'sale_code',
            'status',
            'customer',
            'total_kes',
            'credit_sale',
            'created_at',
            'completed_at',
            'credit_due_at',
            'location_id',
          ],
          this.recentSales
            .orders()
            .map(row => [
              row.id,
              row.code,
              row.status,
              row.customers
                ? [row.customers.first_name, row.customers.last_name].filter(Boolean).join(' ')
                : '',
              row.total,
              row.is_credit_sale,
              row.created_at,
              row.completed_at,
              row.credit_due_at,
              row.location_id,
            ])
        );
    }
  }

  private async requireLoaded(load: Promise<boolean>, loaded: () => boolean): Promise<void> {
    await load;
    if (!loaded()) throw new Error('No cached data is available on this device yet.');
  }

  private async download(
    name: string,
    headers: string[],
    rows: ExportValue[][]
  ): Promise<CachedExportResult> {
    const workbook = await createExcelWorkbook();
    workbook.creator = 'DukaRun';
    workbook.created = new Date();
    addExportSheet(workbook, worksheetTitle(name), headers, rows);

    const filename = `dukarun-${name}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const bytes = await workbook.xlsx.writeBuffer();
    const blob = new Blob([new Uint8Array(bytes)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return { filename, rows: rows.length };
  }
}

export function addExportSheet(
  workbook: Workbook,
  title: string,
  headers: readonly string[],
  rows: readonly (readonly ExportValue[])[]
): Worksheet {
  const sheet = workbook.addWorksheet(title, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: '1F4E78' } },
  });
  sheet.addRow([...headers]);
  rows.forEach(row => sheet.addRow([...row]));
  sheet.columns = headers.map((header, index) => ({
    key: header,
    width: Math.min(
      40,
      Math.max(
        14,
        header.length + 2,
        ...rows.slice(0, 100).map(row => String(row[index] ?? '').length + 2)
      )
    ),
  }));
  sheet.autoFilter = {
    from: 'A1',
    to: `${columnName(headers.length)}${Math.max(1, sheet.rowCount)}`,
  };

  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  headers.forEach((header, index) => {
    if (header.endsWith('_kes')) sheet.getColumn(index + 1).numFmt = '#,##0';
    if (header === 'quantity') sheet.getColumn(index + 1).numFmt = '0.000';
  });
  return sheet;
}

function worksheetTitle(name: string): string {
  return name
    .split('-')
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function columnName(column: number): string {
  let name = '';
  for (let current = column; current > 0; current = Math.floor((current - 1) / 26)) {
    name = String.fromCharCode(((current - 1) % 26) + 65) + name;
  }
  return name;
}
