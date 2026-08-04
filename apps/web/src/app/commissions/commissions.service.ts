import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type CommissionPlan = Database['public']['Tables']['commission_plans']['Row'];
export type CommissionAssignment = Database['public']['Tables']['commission_assignments']['Row'];
export type StaffProfile = Database['public']['Tables']['company_staff_profiles']['Row'];
export type CommissionPeriod =
  Database['public']['Functions']['list_commission_periods']['Returns'][number];
export type CommissionStatementRow =
  Database['public']['Functions']['commission_period_statement']['Returns'][number];

export interface CommissionConfiguration {
  plans: CommissionPlan[];
  assignments: CommissionAssignment[];
  staff: StaffProfile[];
}

export interface CommissionPlanInput {
  name: string;
  rateBps: number;
  effectiveFrom: string;
  effectiveTo?: string;
  active?: boolean;
  planId?: string;
}

export interface CommissionAssignmentInput {
  planId: string;
  staffUserId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  assignmentId?: string;
}

@Injectable({ providedIn: 'root' })
export class CommissionsService {
  private readonly supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async configuration(): Promise<CommissionConfiguration> {
    const [plans, assignments, staff] = await Promise.all([
      this.db.from('commission_plans').select('*').order('effective_from', { ascending: false }),
      this.db
        .from('commission_assignments')
        .select('*')
        .order('effective_from', { ascending: false }),
      this.db.from('company_staff_profiles').select('*').order('display_name'),
    ]);
    if (plans.error) throw plans.error;
    if (assignments.error) throw assignments.error;
    if (staff.error) throw staff.error;
    return {
      plans: plans.data ?? [],
      assignments: assignments.data ?? [],
      staff: staff.data ?? [],
    };
  }

  async periods(): Promise<CommissionPeriod[]> {
    const { data, error } = await this.db.rpc('list_commission_periods');
    if (error) throw rpcError(error);
    return data;
  }

  async statement(periodId: string): Promise<CommissionStatementRow[]> {
    const { data, error } = await this.db.rpc('commission_period_statement', {
      p_period_id: periodId,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async savePlan(input: CommissionPlanInput): Promise<string> {
    const { data, error } = await this.db.rpc('upsert_commission_plan', {
      p_name: input.name.trim(),
      p_rate_bps: input.rateBps,
      p_effective_from: input.effectiveFrom,
      p_effective_to: input.effectiveTo || undefined,
      p_active: input.active ?? true,
      p_plan_id: input.planId,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async assignPlan(input: CommissionAssignmentInput): Promise<string> {
    const { data, error } = await this.db.rpc('assign_commission_plan', {
      p_plan_id: input.planId,
      p_staff_user_id: input.staffUserId,
      p_effective_from: input.effectiveFrom,
      p_effective_to: input.effectiveTo || undefined,
      p_assignment_id: input.assignmentId,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async generatePeriod(startDate: string, endDate: string): Promise<string> {
    const { data, error } = await this.db.rpc('generate_commission_period', {
      p_start_date: startDate,
      p_end_date: endDate,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async updatePeriodStatus(periodId: string, status: 'approved' | 'paid', notes?: string) {
    const { data, error } = await this.db.rpc('update_commission_period_status', {
      p_period_id: periodId,
      p_status: status,
      p_notes: notes || undefined,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async addAdjustment(
    periodId: string,
    staffUserId: string,
    amount: number,
    reason: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('add_commission_adjustment', {
      p_period_id: periodId,
      p_staff_user_id: staffUserId,
      p_commission_amount: amount,
      p_reason: reason.trim(),
    });
    if (error) throw rpcError(error);
    return data;
  }
}
