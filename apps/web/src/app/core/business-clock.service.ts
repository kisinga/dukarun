import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

/** Tenant-aware business date sourced from the database clock. */
@Injectable({ providedIn: 'root' })
export class BusinessClockService {
  private readonly supabase = inject(SupabaseService);
  private inFlight: Promise<string> | null = null;

  async today(): Promise<string> {
    if (this.inFlight) return this.inFlight;

    const request = this.fetch();
    this.inFlight = request;
    try {
      return await request;
    } finally {
      if (this.inFlight === request) this.inFlight = null;
    }
  }

  private async fetch(): Promise<string> {
    const { data, error } = await this.supabase.client.rpc('current_business_date');
    if (error) throw new Error(error.message);
    if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      throw new Error('The server returned an invalid business date');
    }
    return data;
  }
}
