import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface PublicBillingConfig {
  newCustomerTierCode: string;
  newCustomerTierName: string;
  initialPurchasePrice: number;
  testingAccessMonths: number;
}

@Injectable({ providedIn: 'root' })
export class BillingConfigService {
  private readonly supabase = inject(SupabaseService);

  async load(): Promise<PublicBillingConfig | null> {
    const { data, error } = await this.supabase.client.rpc('public_billing_config');
    if (error) throw error;
    return data as unknown as PublicBillingConfig | null;
  }
}
