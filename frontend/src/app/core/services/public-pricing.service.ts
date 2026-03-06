import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, catchError, of } from 'rxjs';

const GET_PUBLIC_TIERS = `
  query GetPublicSubscriptionTiers {
    getPublicSubscriptionTiers {
      code
      name
      description
      priceMonthly
      priceYearly
      features
    }
  }
`;

const GET_PUBLIC_PLATFORM_CONFIG = `
  query GetPublicPlatformConfig {
    getPublicPlatformConfig {
      trialDays
    }
  }
`;

/** Tier from API: priceMonthly and priceYearly are in cents (smallest unit). Convert to Sh for display (divide by 100). */
export interface PublicSubscriptionTier {
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
}

export interface PublicPlatformConfig {
  trialDays: number;
}

@Injectable({
  providedIn: 'root',
})
export class PublicPricingService {
  private readonly http = inject(HttpClient);

  /** Shop API base (no auth). Relative path works with proxy / same origin. */
  private readonly shopApiUrl = '/shop-api';

  async getPublicTiers(): Promise<PublicSubscriptionTier[]> {
    const body = { query: GET_PUBLIC_TIERS };
    const res = await firstValueFrom(
      this.http
        .post<{
          data?: { getPublicSubscriptionTiers?: PublicSubscriptionTier[] };
          errors?: unknown[];
        }>(this.shopApiUrl, body, { withCredentials: false, responseType: 'json' })
        .pipe(catchError(() => of({ data: undefined, errors: [] }))),
    );
    if (res.errors?.length || !res.data?.getPublicSubscriptionTiers) {
      return [];
    }
    return res.data.getPublicSubscriptionTiers;
  }

  async getPublicPlatformConfig(): Promise<PublicPlatformConfig | null> {
    const body = { query: GET_PUBLIC_PLATFORM_CONFIG };
    const res = await firstValueFrom(
      this.http
        .post<{
          data?: { getPublicPlatformConfig?: PublicPlatformConfig };
          errors?: unknown[];
        }>(this.shopApiUrl, body, { withCredentials: false, responseType: 'json' })
        .pipe(catchError(() => of({ data: undefined, errors: [] }))),
    );
    if (res.errors?.length || !res.data?.getPublicPlatformConfig) {
      return null;
    }
    return res.data.getPublicPlatformConfig;
  }
}
