/**
 * OrderItemService tests
 *
 * Guards against regression: custom line prices must trigger Vendure price recalculation
 * (adjustOrderLine) so line and order totals reflect the custom price.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { OrderItemService } from '../../../src/services/orders/order-item.service';
import { OrderService } from '@vendure/core';
import { PriceOverrideService } from '../../../src/services/orders/price-override.service';
import { CartItemInput } from '../../../src/services/orders/order-creation.service';

describe('OrderItemService', () => {
  const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;
  const orderId = '10';
  const orderLineId = '28';
  const variantId = '15';

  let orderService: any;
  let priceOverrideService: any;
  let service: OrderItemService;

  const mockOrder = {
    id: orderId,
    lines: [
      {
        id: orderLineId,
        productVariant: { id: variantId },
      },
    ],
  };

  beforeEach(() => {
    orderService = {
      addItemToOrder: jest.fn().mockImplementation(() => Promise.resolve({ __typename: 'Order' })),
      findOne: jest.fn().mockImplementation(() => Promise.resolve(mockOrder)),
      adjustOrderLine: jest.fn().mockImplementation(() => Promise.resolve({ __typename: 'Order' })),
    };
    priceOverrideService = {
      setOrderLineCustomPrice: jest.fn().mockImplementation(() => Promise.resolve(null)),
    };
    service = new OrderItemService(orderService, priceOverrideService);
  });

  describe('addItems with customLinePrice', () => {
    it('calls setOrderLineCustomPrice then adjustOrderLine so price recalculation runs', async () => {
      const customLinePrice = 11640;
      const items: CartItemInput[] = [
        {
          variantId,
          quantity: 1,
          customLinePrice,
          priceOverrideReason: '3% decrease',
        },
      ];

      await service.addItems(ctx, orderId, items);

      expect(priceOverrideService.setOrderLineCustomPrice).toHaveBeenCalledTimes(1);
      expect(priceOverrideService.setOrderLineCustomPrice).toHaveBeenCalledWith(ctx, {
        orderLineId,
        customLinePrice,
        reason: '3% decrease',
      });

      expect(orderService.adjustOrderLine).toHaveBeenCalledTimes(1);
      expect(orderService.adjustOrderLine).toHaveBeenCalledWith(ctx, orderId, orderLineId, 1);
    });

    it('does not call setOrderLineCustomPrice or adjustOrderLine when customLinePrice is absent', async () => {
      const items: CartItemInput[] = [{ variantId, quantity: 1 }];

      await service.addItems(ctx, orderId, items);

      expect(priceOverrideService.setOrderLineCustomPrice).not.toHaveBeenCalled();
      expect(orderService.adjustOrderLine).not.toHaveBeenCalled();
    });

    it('throws when adjustOrderLine returns an error', async () => {
      orderService.adjustOrderLine.mockResolvedValue({
        errorCode: 'NEGATIVE_QUANTITY_ERROR',
        message: 'Invalid quantity',
      });
      const items: CartItemInput[] = [
        { variantId, quantity: 1, customLinePrice: 10000, priceOverrideReason: 'test' },
      ];

      await expect(service.addItems(ctx, orderId, items)).rejects.toThrow(
        /Failed to apply custom price/
      );
    });
  });
});
