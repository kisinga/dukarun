import type { Permission } from '../core/permissions.service';
import { environment } from '../../environments/environment';

export const LEARNING_CONTENT_KEYS = [
  'creating-a-product',
  'generating-product-barcodes',
  'creating-a-supplier',
  'recording-a-credit-purchase',
  'making-a-cash-sale',
  'selling-by-scanning-a-barcode',
  'creating-a-customer-with-credit',
  'making-a-credit-sale',
  'understanding-the-financial-result',
  'first-business-cycle',
] as const;

export type LearningContentKey = (typeof LEARNING_CONTENT_KEYS)[number];

export const LEARNING_EVENT_NAMES = {
  productCreated: 'dukarun_product_created',
  supplierCreated: 'dukarun_supplier_created',
  creditPurchasePosted: 'dukarun_credit_purchase_posted',
  cashSaleCompleted: 'dukarun_cash_sale_completed',
  customerCreditEnabled: 'dukarun_customer_credit_enabled',
  creditSaleCompleted: 'dukarun_credit_sale_completed',
} as const;

export type LearningEventName = (typeof LEARNING_EVENT_NAMES)[keyof typeof LEARNING_EVENT_NAMES];
export type LearningContentType = 'flow' | 'journey';

export interface LearningContentDefinition {
  key: LearningContentKey;
  title: string;
  type: LearningContentType;
  gitbookPath: string;
  destinationRoute: string;
  permissions: readonly Permission[];
  usertourContentId: string;
}

const content = (
  definition: Omit<LearningContentDefinition, 'usertourContentId'>
): LearningContentDefinition => ({
  ...definition,
  usertourContentId: environment.usertourContentIds[definition.key]?.trim() ?? '',
});

export const LEARNING_CONTENT_REGISTRY: Readonly<
  Record<LearningContentKey, LearningContentDefinition>
> = {
  'creating-a-product': content({
    key: 'creating-a-product',
    title: 'Creating a product',
    type: 'flow',
    gitbookPath: '/products/creating-a-product',
    destinationRoute: '/inventory/products',
    permissions: ['ManageStockAdjustments'],
  }),
  'generating-product-barcodes': content({
    key: 'generating-product-barcodes',
    title: 'Generating product barcodes',
    type: 'flow',
    gitbookPath: '/products/generating-product-barcodes',
    destinationRoute: '/inventory/products',
    permissions: ['ManageStockAdjustments'],
  }),
  'creating-a-supplier': content({
    key: 'creating-a-supplier',
    title: 'Creating a supplier',
    type: 'flow',
    gitbookPath: '/suppliers/creating-a-supplier',
    destinationRoute: '/suppliers',
    permissions: ['ManageSupplierCreditPurchases'],
  }),
  'recording-a-credit-purchase': content({
    key: 'recording-a-credit-purchase',
    title: 'Recording a credit purchase',
    type: 'flow',
    gitbookPath: '/purchases/recording-a-credit-purchase',
    destinationRoute: '/purchases/new',
    permissions: ['ManageSupplierCreditPurchases'],
  }),
  'making-a-cash-sale': content({
    key: 'making-a-cash-sale',
    title: 'Making a cash sale',
    type: 'flow',
    gitbookPath: '/selling/making-a-cash-sale',
    destinationRoute: '/pos/sell',
    permissions: ['SettleOrder'],
  }),
  'selling-by-scanning-a-barcode': content({
    key: 'selling-by-scanning-a-barcode',
    title: 'Selling by scanning a barcode',
    type: 'flow',
    gitbookPath: '/selling/selling-by-scanning-a-barcode',
    destinationRoute: '/pos/sell',
    permissions: ['SettleOrder'],
  }),
  'creating-a-customer-with-credit': content({
    key: 'creating-a-customer-with-credit',
    title: 'Creating a customer and setting credit',
    type: 'flow',
    gitbookPath: '/customers-and-credit/creating-a-customer-with-credit',
    destinationRoute: '/customers',
    permissions: ['ManageCustomers', 'ManageCustomerCreditLimit'],
  }),
  'making-a-credit-sale': content({
    key: 'making-a-credit-sale',
    title: 'Making a credit sale',
    type: 'flow',
    gitbookPath: '/selling/making-a-credit-sale',
    destinationRoute: '/pos/sell',
    permissions: ['SettleOrder'],
  }),
  'understanding-the-financial-result': content({
    key: 'understanding-the-financial-result',
    title: 'Understanding the financial result',
    type: 'flow',
    gitbookPath: '/money-and-reporting/understanding-the-financial-result',
    destinationRoute: '/dashboard',
    permissions: ['ViewFinancials'],
  }),
  'first-business-cycle': content({
    key: 'first-business-cycle',
    title: 'Your first business cycle',
    type: 'journey',
    gitbookPath: '/journeys/first-business-cycle',
    destinationRoute: '/dashboard',
    permissions: [
      'ManageStockAdjustments',
      'ManageSupplierCreditPurchases',
      'SettleOrder',
      'ManageCustomers',
      'ManageCustomerCreditLimit',
      'ViewFinancials',
    ],
  }),
};

export const LEARNING_CATEGORY_PATHS: Readonly<Record<string, string>> = {
  products: '/products',
  selling: '/selling',
  purchases: '/purchases',
  'customers-credit': '/customers-and-credit',
  suppliers: '/suppliers',
  'money-reporting': '/money-and-reporting',
};

export function isLearningContentKey(value: string | null): value is LearningContentKey {
  return value !== null && (LEARNING_CONTENT_KEYS as readonly string[]).includes(value);
}

export function gitBookPathForTopic(topic: string | null): string | null {
  return isLearningContentKey(topic) && topic !== 'first-business-cycle'
    ? LEARNING_CONTENT_REGISTRY[topic].gitbookPath
    : null;
}
