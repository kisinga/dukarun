import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { PrintFormat } from '../../shared/print/print.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { SellStatusMessagesComponent } from './sell-status-messages.component';
import type { DraftFlag, SaleSuccessMessage } from './sell.types';

const stockWarning: DraftFlag = {
  kind: 'stock',
  label: 'Mango Juice',
  was: 0,
  now: 0,
  overridePrice: 0,
  available: 2,
  needed: 5,
  count: 0,
};

@Component({
  imports: [SellStatusMessagesComponent],
  template: `
    <app-sell-status-messages
      [success]="success"
      [error]="error"
      [notice]="notice"
      [draftId]="draftId"
      [draftFlags]="draftFlags"
      [draftFlagsDismissed]="draftFlagsDismissed"
      [printerEnabled]="printerEnabled"
      [busy]="busy"
      [printFormat]="printFormat"
      [printTemplates]="printTemplates"
      (printFormatChange)="printFormat = $event"
      (printReceipt)="printed = $event"
      (newSale)="newSaleClicked = true"
      (dismissError)="error = null"
      (dismissNotice)="notice = null"
      (dismissDraftWarnings)="draftWarningsDismissed = true"
    />
  `,
})
class HostComponent {
  success: SaleSuccessMessage | null = null;
  error: string | null = null;
  notice: string | null = null;
  draftId: string | null = null;
  draftFlags: DraftFlag[] = [];
  draftFlagsDismissed = false;
  printerEnabled = true;
  busy = false;
  printFormat: PrintFormat = 'receipt-80mm';
  printTemplates: Array<{ id: PrintFormat; name: string; width: string }> = [
    { id: 'receipt-80mm', name: '80mm receipt', width: '80mm' },
    { id: 'a4', name: 'A4 invoice', width: '210mm' },
  ];
  printed: string | null = null;
  newSaleClicked = false;
  draftWarningsDismissed = false;
}

describe('SellStatusMessagesComponent', () => {
  async function render(configure?: (host: HostComponent) => void) {
    await TestBed.configureTestingModule({ imports: [HostComponent] })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    configure?.(fixture.componentInstance);
    fixture.detectChanges();
    return fixture;
  }

  it('renders receipt actions and emits print state changes', async () => {
    const fixture = await render(host => {
      host.success = { text: 'Sale completed', tone: 'success', orderId: 'order-1' };
    });
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Sale completed');

    const select = root.querySelector('select') as HTMLSelectElement;
    select.value = 'a4';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.printFormat).toBe('a4');

    const printButton = [...root.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Print receipt')
    ) as HTMLButtonElement;
    printButton.click();
    expect(fixture.componentInstance.printed).toBe('order-1');

    const newSaleButton = [...root.querySelectorAll('button')].find(button =>
      button.textContent?.includes('New sale')
    ) as HTMLButtonElement;
    newSaleButton.click();
    expect(fixture.componentInstance.newSaleClicked).toBe(true);
  });

  it('renders proforma warnings as a scannable list and emits dismiss', async () => {
    const fixture = await render(host => {
      host.draftId = 'draft-1';
      host.draftFlags = [stockWarning];
    });
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('ul')).not.toBeNull();
    expect(root.textContent).toContain('This proforma changed since it was saved');
    expect(root.textContent).toContain('Mango Juice: only 2 in stock, proforma needs 5.');

    const dismissButton = root.querySelector(
      'button[aria-label="Dismiss proforma warnings"]'
    ) as HTMLButtonElement;
    dismissButton.click();
    expect(fixture.componentInstance.draftWarningsDismissed).toBe(true);
  });
});
