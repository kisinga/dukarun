/**
 * OrderService tests
 *
 * Ensures createOrder does not fetch payment methods (no redundant query) and
 * sends the CreateOrder mutation with correct input (cartItems with customLinePrice in cents).
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApolloClient } from '@apollo/client';
import { CREATE_ORDER } from '../graphql/operations.graphql';
import { APOLLO_TEST_CLIENT } from './apollo-test-client.token';
import { OrderService } from './order.service';
import { OrderSetupService } from './order-setup.service';

describe('OrderService', () => {
  let querySpy: jasmine.Spy;
  let mutateSpy: jasmine.Spy;
  let service: OrderService;

  const mockOrder = {
    id: '18',
    code: 'HEY6ZMADAFB6BFP1',
    state: 'PaymentSettled',
    total: 9700,
    totalWithTax: 11155,
    customer: null,
    lines: [
      {
        id: '29',
        quantity: 1,
        linePrice: 9700,
        linePriceWithTax: 11155,
        productVariant: { id: '11', name: 'Product' },
      },
    ],
    payments: [
      {
        id: '18',
        state: 'Settled',
        amount: 11155,
        method: 'cash-34',
        metadata: { paymentMethod: 'cash-34' },
      },
    ],
  };

  beforeEach(() => {
    querySpy = jasmine.createSpy('query');
    mutateSpy = jasmine.createSpy('mutate').and.returnValue(
      Promise.resolve({
        data: { createOrder: mockOrder },
        errors: undefined,
      }),
    );
    const fakeClient = {
      query: querySpy,
      mutate: mutateSpy,
    } as unknown as ApolloClient;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        OrderService,
        { provide: APOLLO_TEST_CLIENT, useValue: fakeClient },
        {
          provide: OrderSetupService,
          useValue: {},
        },
      ],
    });

    service = TestBed.inject(OrderService);
  });

  describe('createOrder', () => {
    it('does not call client.query before the mutation (no payment methods fetch)', async () => {
      await service.createOrder({
        cartItems: [
          {
            variantId: '11',
            quantity: 1,
            customLinePrice: 9700,
            priceOverrideReason: '3% decrease',
          },
        ],
        paymentMethodCode: 'cash-34',
        metadata: { paymentMethod: 'cash-34' },
      });

      expect(querySpy).not.toHaveBeenCalled();
    });

    it('calls client.mutate once with CreateOrder mutation and correct input', async () => {
      const input = {
        cartItems: [
          {
            variantId: '11',
            quantity: 1,
            customLinePrice: 9700,
            priceOverrideReason: '3% decrease',
          },
        ],
        paymentMethodCode: 'cash-34',
        metadata: { paymentMethod: 'cash-34' },
      };

      await service.createOrder(input);

      expect(mutateSpy).toHaveBeenCalledTimes(1);
      const call = mutateSpy.calls.mostRecent().args[0];
      expect(call.mutation).toBe(CREATE_ORDER);
      expect(call.variables?.input?.cartItems).toEqual([
        jasmine.objectContaining({
          variantId: '11',
          quantity: 1,
          customLinePrice: 9700,
          priceOverrideReason: '3% decrease',
        }),
      ]);
      expect(call.variables?.input?.paymentMethodCode).toBe('cash-34');
      expect(call.variables?.input?.metadata).toEqual({ paymentMethod: 'cash-34' });
    });

    it('returns the created order from mutation response', async () => {
      const order = await service.createOrder({
        cartItems: [{ variantId: '11', quantity: 1 }],
        paymentMethodCode: 'cash-34',
      });

      expect(order).toBeTruthy();
      expect(order.id).toBe(mockOrder.id);
      expect(order.code).toBe(mockOrder.code);
      expect(order.total).toBe(9700);
      expect(order.lines?.length).toBe(1);
      expect(order.lines![0].linePrice).toBe(9700);
    });
  });
});
