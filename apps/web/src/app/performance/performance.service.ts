import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';

export type StaffPerformance =
  Database['public']['Functions']['staff_sales_performance']['Returns'][number];
export type StaffDailyPerformance =
  Database['public']['Functions']['staff_sales_daily']['Returns'][number];

@Injectable({ providedIn: 'root' })
export class PerformanceService {
  private readonly supabase = inject(SupabaseService);

  async staff(from: string, to: string): Promise<StaffPerformance[]> {
    const { data, error } = await this.supabase.client.rpc('staff_sales_performance', {
      p_from: from,
      p_to: to,
    });
    if (error) throw error;
    return data;
  }

  async daily(from: string, to: string, staffUserId: string): Promise<StaffDailyPerformance[]> {
    const { data, error } = await this.supabase.client.rpc('staff_sales_daily', {
      p_from: from,
      p_to: to,
      p_staff_user_id: staffUserId,
    });
    if (error) throw error;
    return data;
  }
}
