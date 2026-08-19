import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { IconComponent } from '../../shared/ui/icon.component';
import { CheckoutPanelComponent, type PaymentMethodOption } from './checkout-panel.component';

const methods: PaymentMethodOption[] = [
  {
    code: 'cash',
    name: 'Cash',
    isCashierControlled: true,
    reconciliationType: 'blind_count',
  },
  {
    code: 'mpesa',
    name: 'M-PESA',
    isCashierControlled: true,
    reconciliationType: 'transaction_verification',
    defaultAccountCode: 'MPESA_DEFAULT',
    accounts: [
      { code: 'MPESA_DEFAULT', name: 'Main Till', isDefault: true },
      { code: 'MPESA_SECOND', name: 'Delivery Till' },
    ],
  },
];

describe('CheckoutPanelComponent payment accounts', () => {
  async function render(stkEnabled = false) {
    await TestBed.configureTestingModule({ imports: [CheckoutPanelComponent] })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(CheckoutPanelComponent);
    fixture.componentRef.setInput('total', 500);
    fixture.componentRef.setInput('methods', methods);
    fixture.componentRef.setInput('mpesaStkEnabled', stkEnabled);
    fixture.componentRef.setInput('defaultPayerPhone', '0712345678');
    fixture.detectChanges();
    const mpesa = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.trim().startsWith('M-PESA')
    ) as HTMLButtonElement;
    mpesa.click();
    fixture.detectChanges();
    return fixture;
  }

  it('preselects the default but emits a cashier-selected manual M-PESA account', async () => {
    const fixture = await render(false);
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('MPESA_DEFAULT');
    select.value = 'MPESA_SECOND';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    const complete = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Complete sale')
    ) as HTMLButtonElement;
    complete.click();

    expect(confirmed).toHaveBeenCalledWith([
      { method: 'mpesa', amount: 500, account_code: 'MPESA_SECOND' },
    ]);
  });

  it('locks STK to the location default and hides the account selector', async () => {
    const fixture = await render(true);
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Main Till');
  });
});
