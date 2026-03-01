/**
 * PayOrderModalComponent (Record Payment modal) tests
 *
 * Amount capping at outstanding, submit via recordPayment (single order or bulk).
 */

import { provideZonelessChangeDetection, signal } from '@angular/core';
import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CashierSessionService } from '../../../../core/services/cashier-session/cashier-session.service';
import { CompanyService } from '../../../../core/services/company.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { CustomerPaymentService } from '../../../../core/services/customer/customer-payment.service';
import { CustomerStateService } from '../../../../core/services/customer/customer-state.service';
import { OrdersService } from '../../../../core/services/orders.service';
import { PaymentMethodService } from '../../../../core/services/payment-method.service';
import { PayOrderModalComponent, PayOrderModalData } from './pay-order-modal.component';

describe('PayOrderModalComponent', () => {
  let component: PayOrderModalComponent;
  let fixture: ComponentFixture<PayOrderModalComponent>;
  let paymentServiceSpy: jasmine.SpyObj<Pick<CustomerPaymentService, 'recordPayment'>>;
  let paymentMethodServiceGetMethodsSpy: jasmine.Spy;

  const defaultModalData: PayOrderModalData = {
    customerId: 'cust-1',
    customerName: 'Test Customer',
    outstandingAmount: 10000,
    totalAmount: 10000,
    orderId: 'order-1',
    orderCode: 'ORD-001',
  };

  beforeEach(async () => {
    paymentServiceSpy = jasmine.createSpyObj('CustomerPaymentService', ['recordPayment']);
    paymentServiceSpy.recordPayment.and.returnValue(
      Promise.resolve({
        ordersPaid: [{ orderId: 'order-1', orderCode: 'ORD-001', amountPaid: 5000 }],
        remainingBalance: 5000,
        totalAllocated: 5000,
      }),
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
        {
          provide: OrdersService,
          useValue: { fetchOrders: jasmine.createSpy().and.returnValue(Promise.resolve()) },
        },
        {
          provide: PaymentMethodService,
          useValue: {
            getPaymentMethods: (paymentMethodServiceGetMethodsSpy = jasmine
              .createSpy('getPaymentMethods')
              .and.returnValue(
                Promise.resolve([
                  {
                    id: '1',
                    code: 'credit',
                    name: 'Credit',
                    enabled: true,
                    customFields: { isActive: true },
                  },
                ]),
              )),
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
    it('should load payment methods when show is called', async () => {
      await component.show();
      expect(paymentMethodServiceGetMethodsSpy).toHaveBeenCalled();
    });
  });

  describe('onConfirmPayment', () => {
    it('should call recordPayment with customerId, amount, paymentMethodCode, referenceNumber, and orderId', async () => {
      setOrderData(defaultModalData);
      component.paymentAmountInput.set('25'); // 2500 cents
      component.selectedPaymentMethod.set('credit');
      component.referenceCode.set('REF-123');

      await component.onConfirmPayment();

      expect(paymentServiceSpy.recordPayment).toHaveBeenCalledWith({
        customerId: 'cust-1',
        paymentAmount: 2500,
        paymentMethodCode: 'credit',
        referenceNumber: 'REF-123',
        orderId: 'order-1',
      });
    });

    it('should call recordPayment without orderId when data has no orderId (bulk)', async () => {
      setOrderData({
        customerId: 'cust-1',
        customerName: 'Test Customer',
        outstandingAmount: 8000,
      });
      component.paymentAmountInput.set('');
      component.selectedPaymentMethod.set('credit');
      component.referenceCode.set('BULK-REF');

      await component.onConfirmPayment();

      expect(paymentServiceSpy.recordPayment).toHaveBeenCalledWith({
        customerId: 'cust-1',
        paymentAmount: 8000,
        paymentMethodCode: 'credit',
        referenceNumber: 'BULK-REF',
        orderId: undefined,
      });
    });
  });
});
