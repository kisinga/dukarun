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
      return {
        price: customLinePrice / 100 / quantity,
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
      // When channel uses tax-inclusive pricing, Vendure stores the base price (without tax)
      // in productVariant.price. We need to calculate the tax-inclusive price.
      // Example: basePrice = 8621 (KES 86.21), tax-inclusive = 10000 (KES 100.00) with 16% VAT
      const basePrice = productVariant.price;

      // Calculate tax-inclusive price by adding tax to base price
      // Try multiple methods to get the tax rate, in order of preference:
      let taxRate: number | null = null;

      // Method 1: Get tax rate from variant's taxRateApplied if available
      if ((productVariant as any).taxRateApplied?.value != null) {
        taxRate = (productVariant as any).taxRateApplied.value; // e.g., 16 for 16%
      }

      // Method 2: If listPriceIncludesTax is true, price already includes tax - no calculation needed
      if (productVariant.listPriceIncludesTax) {
        return {
          price: basePrice,
          priceIncludesTax: true,
        };
      }

      // Method 3: Fallback to 16% VAT (Kenya standard rate)
      // All channels in Kenya geo use this rate based on migration data
      if (taxRate == null) {
        taxRate = 16;
      }

      // Calculate tax-inclusive price: basePrice * (1 + taxRate/100)
      const taxInclusivePrice = Math.round(basePrice * (1 + taxRate / 100));

      return {
        price: taxInclusivePrice,
        priceIncludesTax: true,
      };
    }

    // Fall back to variant price (when channel doesn't use tax-inclusive pricing)
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
