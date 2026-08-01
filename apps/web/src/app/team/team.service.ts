import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type Role = Database['public']['Tables']['roles']['Row'];
export type Membership = Database['public']['Tables']['company_memberships']['Row'];

export type MembershipWithRole = Membership & {
  roles: Pick<Role, 'name' | 'permissions'> | null;
};

/** The 14 assignable permissions (role editor checkboxes). */
export const ALL_PERMISSIONS = [
  'ManageApprovals',
  'OverridePrice',
  'ManageStockAdjustments',
  'ApproveCustomerCredit',
  'ManageCustomerCreditLimit',
  'ReverseOrder',
  'OverrideCustomerBalance',
  'SettleOrder',
  'ManageSupplierCreditPurchases',
  'ViewFinancials',
  'ManageReconciliation',
  'CloseAccountingPeriod',
  'CreateInterAccountTransfer',
  'ManageTeam',
] as const;

@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async memberships(): Promise<MembershipWithRole[]> {
    const { data, error } = await this.db
      .from('company_memberships')
      .select('*, roles(name, permissions)')
      .order('created_at');
    if (error) throw error;
    return data;
  }

  async roles(): Promise<Role[]> {
    const { data, error } = await this.db.from('roles').select('*').order('name');
    if (error) throw error;
    return data;
  }

  /** Create (no roleId) or update a role. Errors are P0001 — display verbatim. */
  async upsertRole(name: string, permissions: string[], roleId?: string): Promise<string> {
    const { data, error } = await this.db.rpc('upsert_role', {
      p_name: name,
      p_permissions: permissions,
      ...(roleId ? { p_role_id: roleId } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** Person must have logged in once (user_not_registered otherwise). */
  async addTeamMember(phone: string, roleId: string): Promise<string> {
    const { data, error } = await this.db.rpc('add_team_member', {
      p_phone: phone,
      p_role_id: roleId,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async updateTeamMember(
    membershipId: string,
    changes: { role_id?: string; authorization_status?: string }
  ): Promise<string> {
    const { data, error } = await this.db.rpc('update_team_member', {
      p_membership_id: membershipId,
      ...(changes.role_id ? { p_role_id: changes.role_id } : {}),
      ...(changes.authorization_status
        ? { p_authorization_status: changes.authorization_status }
        : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async removeTeamMember(membershipId: string): Promise<string> {
    const { data, error } = await this.db.rpc('remove_team_member', {
      p_membership_id: membershipId,
    });
    if (error) throw rpcError(error);
    return data;
  }
}
