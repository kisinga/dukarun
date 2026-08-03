import { Injectable, Logger } from '@nestjs/common';
import {
  OrderItemPriceCalculationStrategy,
  PriceCalculationResult,
  ProductVariant,
  RequestContext,
} from '@vendure/core';

@Injectable()
export class CustomPriceCalculationStrategy implements OrderItemPriceCalculationStrategy {
  private readonly logger = new Logger(CustomPriceCalculationStrategy.name);
  calculateUnitPrice(
    ctx: RequestContext,
    productVariant: ProductVariant,
    orderLineCustomFields: { [key: string]: any },
    order: any,
    quantity: number
  ): PriceCalculationResult | Promise<PriceCalculationResult> {
    const customLinePrice = orderLineCustomFields?.customLinePrice;

    if (customLinePrice && customLinePrice > 0) {
      if (this.hasInvalidFractionalQuantity(quantity)) {
        throw new Error('Quantity can have at most 1 decimal place');
      }

      const wholesalePrice = (productVariant.customFields as any)?.wholesalePrice;
      if (wholesalePrice && customLinePrice < wholesalePrice) {
        this.logger.warn(
          `Price override below wholesale limit: ${customLinePrice} < ${wholesalePrice} for variant ${productVariant.id}`
        );
      }

      // Vendure expects price in smallest currency unit (cents). customLinePrice is line total in cents.
      return {
        price: customLinePrice / quantity,
        priceIncludesTax: true,
      };
    }

    if (this.hasInvalidFractionalQuantity(quantity)) {
      throw new Error('Quantity can have at most 1 decimal place');
    }

    if (ctx.channel?.pricesIncludeTax === true) {
      // Use priceWithTax (tax-inclusive) instead of price (base after extraction)
      // to prevent double tax extraction
      return {
        price: productVariant.priceWithTax,
        priceIncludesTax: true,
      };
    }

    return {
      price: productVariant.price,
      priceIncludesTax: productVariant.listPriceIncludesTax,
    };
  }

  /**
   * Validates that quantity has at most 1 decimal place
   * Rejects: 0.55, 0.123, 1.234
   * Accepts: 0.5, 1.0, 2.3
   */
  private hasInvalidFractionalQuantity(quantity: number): boolean {
    // Check if quantity has more than 1 decimal place
    const decimalPlaces = (quantity.toString().split('.')[1] || '').length;
    return decimalPlaces > 1;
  }
}
