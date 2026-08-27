import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { IconComponent } from '../../shared/ui/icon.component';
import { SellPaymentActionsComponent } from './sell-payment-actions.component';

describe('SellPaymentActionsComponent', () => {
  async function render(
    overrides: Partial<{
      mode: 'sidebar' | 'dock';
      total: number;
      itemCount: number;
      empty: boolean;
      busy: boolean;
      canTakePayment: boolean;
      canSettleOrder: boolean;
      codCheckout: boolean;
      creditAllowed: boolean;
      cashierFlowEnabled: boolean;
      fulfillmentMode: string;
    }> = {}
  ) {
    await TestBed.configureTestingModule({
      imports: [SellPaymentActionsComponent],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(SellPaymentActionsComponent);
    const checkout = vi.fn();
    const sellOnCredit = vi.fn();
    const sendToCashier = vi.fn();
    const saveProforma = vi.fn();
    fixture.componentInstance.checkout.subscribe(checkout);
    fixture.componentInstance.sellOnCredit.subscribe(sellOnCredit);
    fixture.componentInstance.sendToCashier.subscribe(sendToCashier);
    fixture.componentInstance.saveProforma.subscribe(saveProforma);
    fixture.componentRef.setInput('mode', overrides.mode ?? 'sidebar');
    fixture.componentRef.setInput('total', overrides.total ?? 1200);
    fixture.componentRef.setInput('itemCount', overrides.itemCount ?? 2);
    fixture.componentRef.setInput('empty', overrides.empty ?? false);
    fixture.componentRef.setInput('busy', overrides.busy ?? false);
    fixture.componentRef.setInput('canTakePayment', overrides.canTakePayment ?? true);
    fixture.componentRef.setInput('canSettleOrder', overrides.canSettleOrder ?? true);
    fixture.componentRef.setInput('codCheckout', overrides.codCheckout ?? false);
    fixture.componentRef.setInput('creditAllowed', overrides.creditAllowed ?? true);
    fixture.componentRef.setInput('cashierFlowEnabled', overrides.cashierFlowEnabled ?? true);
    fixture.componentRef.setInput('fulfillmentMode', overrides.fulfillmentMode ?? 'counter');
    fixture.detectChanges();
    return { fixture, checkout, sellOnCredit, sendToCashier, saveProforma };
  }

  it('renders sidebar actions and emits checkout, credit, cashier, and proforma intents', async () => {
    const { fixture, checkout, sellOnCredit, sendToCashier, saveProforma } = await render();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Amount due');
    expect(root.textContent).toContain('2 items');
    clickButton(root, 'Take payment');
    clickButton(root, 'Sell on credit');
    clickButton(root, 'Send to cashier');
    clickButton(root, 'Save proforma');

    expect(checkout).toHaveBeenCalledOnce();
    expect(sellOnCredit).toHaveBeenCalledOnce();
    expect(sendToCashier).toHaveBeenCalledOnce();
    expect(saveProforma).toHaveBeenCalledOnce();
  });

  it('allows COD checkout without an open till while preserving the dock affordance', async () => {
    const { fixture, checkout } = await render({
      mode: 'dock',
      canTakePayment: false,
      codCheckout: true,
      creditAllowed: false,
      fulfillmentMode: 'delivery',
    });
    const root = fixture.nativeElement as HTMLElement;
    const button = findButton(root, 'Place COD order');

    expect(root.querySelector('[data-testid="sell-payment-dock"]')).not.toBeNull();
    expect(button.disabled).toBe(false);
    button.click();
    expect(checkout).toHaveBeenCalledOnce();
  });

  it('disables the primary action when the role cannot settle orders', async () => {
    const { fixture } = await render({ canSettleOrder: false });
    const button = findButton(fixture.nativeElement as HTMLElement, 'Take payment');

    expect(button.disabled).toBe(true);
  });
});

function clickButton(root: HTMLElement, label: string): void {
  findButton(root, label).click();
}

function findButton(root: HTMLElement, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')].find(item =>
    item.textContent?.includes(label)
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}
