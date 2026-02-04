/**
 * PayOrderModalComponent tests
 *
 * Amount capping at outstanding, submit with amount and debitAccountCode,
 * and loading payment source accounts on show.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { PayOrderModalComponent, PayOrderModalData } from './pay-order-modal.component';
import { CashierSessionService } from '../../../../core/services/cashier-session/cashier-session.service';
import { CompanyService } from '../../../../core/services/company.service';
import { CustomerPaymentService } from '../../../../core/services/customer/customer-payment.service';
import { CustomerStateService } from '../../../../core/services/customer/customer-state.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { LedgerService } from '../../../../core/services/ledger/ledger.service';
import { OrdersService } from '../../../../core/services/orders.service';
import { PaymentMethodService } from '../../../../core/services/payment-method.service';

describe('PayOrderModalComponent', () => {
  let component: PayOrderModalComponent;
  let fixture: ComponentFixture<PayOrderModalComponent>;
  let paymentServiceSpy: jasmine.SpyObj<Pick<CustomerPaymentService, 'paySingleOrder'>>;
  let ledgerServiceSpy: jasmine.SpyObj<Pick<LedgerService, 'loadPaymentSourceAccounts'>>;

  const defaultModalData: PayOrderModalData = {
    orderId: 'order-1',
    orderCode: 'ORD-001',
    customerName: 'Test Customer',
    totalAmount: 10000,
    outstandingAmount: 10000,
  };

  beforeEach(async () => {
    paymentServiceSpy = jasmine.createSpyObj('CustomerPaymentService', ['paySingleOrder']);
    paymentServiceSpy.paySingleOrder.and.returnValue(
      Promise.resolve({
        ordersPaid: [{ orderId: 'order-1', orderCode: 'ORD-001', amountPaid: 5000 }],
        remainingBalance: 5000,
        totalAllocated: 5000,
      }),
    );

    ledgerServiceSpy = jasmine.createSpyObj('LedgerService', ['loadPaymentSourceAccounts']);
    ledgerServiceSpy.loadPaymentSourceAccounts.and.returnValue(
      of([
        {
          id: '1',
          code: 'CASH_ON_HAND',
          name: 'Cash on Hand',
          type: 'asset',
          isActive: true,
          balance: 0,
          isParent: false,
        },
      ]),
    );

    await TestBed.configureTestingModule({
      imports: [PayOrderModalComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: CustomerPaymentService, useValue: paymentServiceSpy },
        {
          provide: CustomerStateService,
          useValue: { setError: jasmine.createSpy(), error: () => null },
        },
        {
          provide: CurrencyService,
          useValue: { format: (n: number) => `${n}`, currency: () => 'KES' },
        },
        { provide: LedgerService, useValue: ledgerServiceSpy },
        {
          provide: OrdersService,
          useValue: { fetchOrders: jasmine.createSpy().and.returnValue(Promise.resolve()) },
        },
        {
          provide: PaymentMethodService,
          useValue: {
            getPaymentMethods: jasmine.createSpy().and.returnValue(
              Promise.resolve([
                {
                  id: '1',
                  code: 'credit',
                  name: 'Credit',
                  enabled: true,
                  customFields: { isActive: true },
                },
              ]),
            ),
          },
        },
        {
          provide: CashierSessionService,
          useValue: {
            hasActiveSession: signal(true) as any,
            currentSession: signal({ id: 's1', channelId: 1 }),
            getCurrentSession: jasmine.createSpy().and.returnValue(of({ id: 's1', channelId: 1 })),
          },
        },
        {
          provide: CompanyService,
          useValue: { activeCompanyId: signal('1') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PayOrderModalComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('orderData', defaultModalData);
    fixture.detectChanges();
  });

  function setOrderData(data: PayOrderModalData) {
    fixture.componentRef.setInput('orderData', data);
  }

  describe('getEffectivePaymentAmountCents', () => {
    it('should return outstandingAmount when amount input is empty', () => {
      setOrderData({ ...defaultModalData, outstandingAmount: 8000 });
      component.paymentAmountInput.set('');
      expect(component.getEffectivePaymentAmountCents()).toBe(8000);
    });

    it('should cap at outstandingAmount when parsed amount exceeds it', () => {
      setOrderData({ ...defaultModalData, outstandingAmount: 5000 });
      component.paymentAmountInput.set('100'); // 10000 cents if 100 = main currency
      expect(component.getEffectivePaymentAmountCents()).toBe(5000);
    });

    it('should return 0 when input is invalid or zero', () => {
      setOrderData(defaultModalData);
      component.paymentAmountInput.set('abc');
      expect(component.getEffectivePaymentAmountCents()).toBe(0);
      component.paymentAmountInput.set('0');
      expect(component.getEffectivePaymentAmountCents()).toBe(0);
    });

    it('should convert main currency to cents and cap at outstanding', () => {
      setOrderData({ ...defaultModalData, outstandingAmount: 10000 });
      component.paymentAmountInput.set('50'); // 50 * 100 = 5000 cents
      expect(component.getEffectivePaymentAmountCents()).toBe(5000);
    });
  });

  describe('show', () => {
    it('should load payment source accounts when show is called', async () => {
      await component.show();
      expect(ledgerServiceSpy.loadPaymentSourceAccounts).toHaveBeenCalled();
    });
  });

  describe('onConfirmPayment', () => {
    it('should call paySingleOrder with amount in cents and debitAccountCode when set', async () => {
      setOrderData(defaultModalData);
      component.paymentAmountInput.set('25'); // 2500 cents
      component.selectedPaymentMethod.set('credit');
      component.referenceCode.set('REF-123');
      component.selectedDebitAccountCode.set('CASH_ON_HAND');

      await component.onConfirmPayment();

      expect(paymentServiceSpy.paySingleOrder).toHaveBeenCalledWith(
        'order-1',
        2500,
        'credit',
        'REF-123',
        'CASH_ON_HAND',
      );
    });
  });
});
