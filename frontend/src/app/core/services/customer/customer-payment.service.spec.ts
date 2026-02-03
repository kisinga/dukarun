/**
 * CustomerPaymentService tests
 *
 * Ensures paySingleOrder calls the mutation with correct variables
 * (orderId, paymentAmount in cents, debitAccountCode when provided).
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApolloClient } from '@apollo/client';
import { APOLLO_TEST_CLIENT } from '../apollo-test-client.token';
import { CustomerPaymentService } from './customer-payment.service';
import { CustomerStateService } from './customer-state.service';

describe('CustomerPaymentService', () => {
  let mutateSpy: jasmine.Spy;
  let service: CustomerPaymentService;

  beforeEach(() => {
    mutateSpy = jasmine.createSpy('mutate').and.returnValue(
      Promise.resolve({
        data: {
          paySingleOrder: {
            ordersPaid: [{ orderId: '1', orderCode: 'ORD-001', amountPaid: 5000 }],
            remainingBalance: 0,
            totalAllocated: 5000,
          },
        },
      }),
    );
    const fakeClient = { mutate: mutateSpy } as unknown as ApolloClient;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CustomerPaymentService,
        CustomerStateService,
        { provide: APOLLO_TEST_CLIENT, useValue: fakeClient },
      ],
    });

    service = TestBed.inject(CustomerPaymentService);
  });

  describe('paySingleOrder', () => {
    it('should call mutation with orderId and optional amount in cents', async () => {
      await service.paySingleOrder('order-123', 5000);

      expect(mutateSpy).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          variables: jasmine.objectContaining({
            input: jasmine.objectContaining({
              orderId: 'order-123',
              paymentAmount: 5000,
            }),
          }),
        }),
      );
    });

    it('should include debitAccountCode in input when provided', async () => {
      await service.paySingleOrder('order-456', 10000, undefined, undefined, 'CASH_ON_HAND');

      expect(mutateSpy).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          variables: jasmine.objectContaining({
            input: jasmine.objectContaining({
              orderId: 'order-456',
              paymentAmount: 10000,
              debitAccountCode: 'CASH_ON_HAND',
            }),
          }),
        }),
      );
    });

    it('should include paymentMethodCode and referenceNumber when provided', async () => {
      await service.paySingleOrder('order-789', 3000, 'credit', 'REF-001');

      const call = mutateSpy.calls.mostRecent().args[0];
      expect(call.variables.input.orderId).toBe('order-789');
      expect(call.variables.input.paymentAmount).toBe(3000);
      expect(call.variables.input.paymentMethodCode).toBe('credit');
      expect(call.variables.input.referenceNumber).toBe('REF-001');
    });

    it('should return payment result when mutation succeeds', async () => {
      const result = await service.paySingleOrder('order-1', 5000);

      expect(result).not.toBeNull();
      expect(result!.totalAllocated).toBe(5000);
      expect(result!.ordersPaid.length).toBe(1);
    });
  });
});
