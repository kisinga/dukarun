import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type Role = Database['public']['Tables']['roles']['Row'];
export type Membership = Database['public']['Tables']['company_memberships']['Row'];
export type StaffProfile = Database['public']['Tables']['company_staff_profiles']['Row'];
export type MembershipLocation =
  Database['public']['Tables']['company_membership_locations']['Row'];
export type TeamLocation = Database['public']['Tables']['stock_locations']['Row'];

export type MembershipWithRole = Membership & {
  roles: Pick<Role, 'name' | 'permissions'> | null;
  staff_profile: Pick<StaffProfile, 'display_name' | 'last_role_name' | 'avatar_path'> | null;
};

export { ALL_PERMISSIONS, PERMISSION_LABELS } from '../core/permissions.service';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async memberships(): Promise<MembershipWithRole[]> {
    const [members, profiles] = await Promise.all([
      this.db.from('company_memberships').select('*, roles(name, permissions)').order('created_at'),
      this.db
        .from('company_staff_profiles')
        .select('user_id, display_name, last_role_name, avatar_path'),
    ]);
    if (members.error) throw members.error;
    if (profiles.error) throw profiles.error;
    const byUser = new Map((profiles.data ?? []).map(profile => [profile.user_id, profile]));
    // Sort by display name: created_at alone is unstable because seeded rows
    // share one transaction timestamp, so any UPDATE reshuffles the list.
    return (members.data ?? [])
      .map(member => ({
        ...member,
        staff_profile: byUser.get(member.user_id) ?? null,
      }))
      .sort((a, b) =>
        (a.staff_profile?.display_name ?? a.user_id).localeCompare(
          b.staff_profile?.display_name ?? b.user_id
        )
      );
  }

  /** Assignable company roles. Platform templates (is_template) are readable via
   *  RLS for apply_role_template but must not be offered for assignment — the
   *  team RPCs reject role ids outside the caller's company. */
  async roles(): Promise<Role[]> {
    const { data, error } = await this.db
      .from('roles')
      .select('*')
      .eq('is_template', false)
      .order('name');
    if (error) throw error;
    return data;
  }

  async locations(): Promise<TeamLocation[]> {
    const { data, error } = await this.db
      .from('stock_locations')
      .select('*')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('name');
    if (error) throw error;
    return data;
  }

  async membershipLocations(): Promise<MembershipLocation[]> {
    const { data, error } = await this.db.from('company_membership_locations').select('*');
    if (error) throw error;
    return data;
  }

  async setMembershipLocations(
    membershipId: string,
    locationIds: string[],
    primaryLocationId: string
  ): Promise<void> {
    const { error } = await this.db.rpc('set_membership_locations', {
      p_membership_id: membershipId,
      p_location_ids: locationIds,
      p_primary_location_id: primaryLocationId,
    });
    if (error) throw rpcError(error);
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
  async addTeamMember(phone: string, roleId: string, displayName?: string): Promise<string> {
    const { data, error } = await this.db.rpc('add_team_member', {
      p_phone: phone,
      p_role_id: roleId,
    });
    if (error) throw rpcError(error);
    if (displayName?.trim()) {
      try {
        await this.updateStaffDisplayName(data, displayName);
      } catch (renameError) {
        const detail = renameError instanceof Error ? renameError.message : 'unknown error';
        throw new Error(`Member added, but setting the name failed: ${detail}`);
      }
    }
    return data;
  }

  async updateStaffDisplayName(membershipId: string, displayName: string): Promise<string> {
    const { data, error } = await this.db.rpc('update_staff_display_name', {
      p_membership_id: membershipId,
      p_display_name: displayName.trim(),
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
