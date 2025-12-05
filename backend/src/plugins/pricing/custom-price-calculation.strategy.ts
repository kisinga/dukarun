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

    this.logger.debug(
      `Calculating unit price for variant ${productVariant.id} (SKU: ${productVariant.sku}), ` +
        `quantity: ${quantity}, channel pricesIncludeTax: ${ctx.channel?.pricesIncludeTax}, ` +
        `variant listPriceIncludesTax: ${productVariant.listPriceIncludesTax}, ` +
        `stored price: ${productVariant.price}, customLinePrice: ${customLinePrice || 'none'}`
    );

    if (customLinePrice && customLinePrice > 0) {
      // Validate fractional quantity (max 1 decimal place)
      if (this.hasInvalidFractionalQuantity(quantity)) {
        throw new Error('Quantity can have at most 1 decimal place');
      }

      // Check wholesale price limit if set
      const wholesalePrice = (productVariant.customFields as any)?.wholesalePrice;
      if (wholesalePrice && customLinePrice < wholesalePrice) {
        // Don't block the transaction, but log a warning
        this.logger.warn(
          `Price override below wholesale limit: ${customLinePrice} < ${wholesalePrice} for variant ${productVariant.id}`
        );
      }

      // Custom line price is total for all items (tax-inclusive)
      // Calculate per-unit price: linePrice / quantity
      const unitPrice = customLinePrice / 100 / quantity;
      this.logger.debug(
        `Using custom line price: ${customLinePrice} cents, quantity: ${quantity}, ` +
          `calculated unit price: ${unitPrice}, priceIncludesTax: true`
      );
      return {
        price: unitPrice,
        priceIncludesTax: true, // Custom prices are always tax-inclusive
      };
    }

    // Validate fractional quantity for regular pricing
    if (this.hasInvalidFractionalQuantity(quantity)) {
      throw new Error('Quantity can have at most 1 decimal place');
    }

    // Check if channel uses tax-inclusive pricing
    // When pricesIncludeTax is true, we need to return the tax-inclusive price
    // This ensures orders show the correct price (e.g., KES 100.00 instead of KES 86.21)
    const channelUsesTaxInclusivePricing = ctx.channel?.pricesIncludeTax === true;

    if (channelUsesTaxInclusivePricing) {
      // IMPORTANT: In our system, when pricesIncludeTax is true on the channel,
      // we store tax-inclusive prices directly in the database (not base prices).
      // This is our system design and storage model - prices are ALWAYS tax-inclusive
      // when pricesIncludeTax: true on the channel, regardless of listPriceIncludesTax.
      //
      // We must ALWAYS return priceIncludesTax: true in this case to prevent Vendure
      // from extracting tax from prices that are already tax-inclusive.
      const storedPrice = productVariant.price;

      this.logger.debug(
        `Returning tax-inclusive price for variant ${productVariant.id}: ${storedPrice} ` +
          `(channel pricesIncludeTax: true, stored price is tax-inclusive per system design, ` +
          `variant listPriceIncludesTax: ${productVariant.listPriceIncludesTax} - ignored)`
      );

      // Always return priceIncludesTax: true when channel uses tax-inclusive pricing,
      // because our storage model guarantees prices are tax-inclusive in this scenario
      return {
        price: storedPrice,
        priceIncludesTax: true,
      };
    }

    // Fall back to variant price (when channel doesn't use tax-inclusive pricing)
    this.logger.debug(
      `Channel does not use tax-inclusive pricing, returning variant price: ${productVariant.price}, ` +
        `priceIncludesTax: ${productVariant.listPriceIncludesTax}`
    );
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
