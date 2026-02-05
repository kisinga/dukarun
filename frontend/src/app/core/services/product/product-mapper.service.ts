import { Injectable } from '@angular/core';
import { extractAssetPreview, extractCents } from '../../utils/data-extractors';
import { ProductSearchResult, ProductVariant } from './product-search.service';

@Injectable({
  providedIn: 'root',
})
export class ProductMapperService {
  /**
   * Transform GraphQL product to ProductSearchResult.
   * All variants pass through toProductVariant for consistent shape.
   * Maps facetValues for manufacturer/category pills.
   */
  toProductSearchResult(graphqlProduct: any): ProductSearchResult {
    const facetValues = (graphqlProduct.facetValues || [])
      .filter((fv: any) => fv?.facet?.code === 'manufacturer' || fv?.facet?.code === 'category')
      .map((fv: any) => ({
        name: fv.name,
        facetCode: fv.facet?.code ?? '',
      }));
    return {
      id: graphqlProduct.id,
      name: graphqlProduct.name,
      featuredAsset: extractAssetPreview(graphqlProduct.featuredAsset),
      variants: (graphqlProduct.variants || []).map((v: any) =>
        this.toProductVariant(v, graphqlProduct),
      ),
      facetValues: facetValues.length > 0 ? facetValues : undefined,
    };
  }

  /**
   * Transform GraphQL variant to ProductVariant.
   * Guarantees customFields (wholesalePrice, allowFractionalQuantity) when present in API.
   */
  toProductVariant(graphqlVariant: any, product: any): ProductVariant {
    const productAsset = product?.featuredAsset;
    const stock = graphqlVariant.stockLevels?.[0]?.stockOnHand ?? graphqlVariant.stockOnHand ?? 0;
    return {
      id: graphqlVariant.id,
      name: graphqlVariant.name,
      sku: graphqlVariant.sku ?? '',
      priceWithTax: this.extractPrice(graphqlVariant),
      stockLevel: stock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      stockOnHand: stock,
      productId: product?.id ?? '',
      productName: product?.name ?? '',
      trackInventory: graphqlVariant.trackInventory,
      featuredAsset: extractAssetPreview(productAsset ?? graphqlVariant.featuredAsset),
      customFields: this.extractProductVariantCustomFields(graphqlVariant),
    };
  }

  private extractPrice(variant: any): number {
    const kesPrice = variant.prices?.find((p: any) => p.currencyCode === 'KES');
    if (kesPrice?.price != null) {
      return extractCents(kesPrice.price);
    }
    return extractCents(variant.priceWithTax ?? variant.price);
  }

  private extractProductVariantCustomFields(variant: any): ProductVariant['customFields'] {
    if (!variant.customFields) return undefined;
    return {
      wholesalePrice: variant.customFields.wholesalePrice ?? undefined,
      allowFractionalQuantity: variant.customFields.allowFractionalQuantity ?? false,
    };
  }
}
