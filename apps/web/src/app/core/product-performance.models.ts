export type DemandConfidence = 'low' | 'medium' | 'high';
export type ProductPerformanceCategory = 'trending' | 'volume' | 'margin' | 'consistent';

export interface ProductPerformanceRow {
  location_id?: string;
  location_name?: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  stock_unit: string;
  current_quantity: number;
  robust_quantity: number;
  previous_robust_quantity: number;
  revenue: number | null;
  margin: number | null;
  order_count: number;
  active_days: number;
  trend_score: number;
  confidence?: DemandConfidence;
  demandConfidence?: DemandConfidence;
  outlier_detected: boolean;
  outlier_share: number;
  stock: number;
  planning_daily_demand: number;
  days_of_cover: number | null;
}

export interface ProductPerformanceResponse {
  windowDays: number;
  generatedAt: string;
  leaders: Record<ProductPerformanceCategory, ProductPerformanceRow[]>;
  financialsIncluded: boolean;
}

export const EMPTY_PRODUCT_PERFORMANCE: ProductPerformanceResponse = {
  windowDays: 30,
  generatedAt: '',
  leaders: { trending: [], volume: [], margin: [], consistent: [] },
  financialsIncluded: false,
};
