import { Injectable, effect, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import {
  CacheJournalService,
  type CacheChange,
  type CacheStreamHandler,
} from '../core/cache-journal.service';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService, type AppIdentity } from '../core/supabase.service';
import {
  cacheWatermarkKey,
  offlineDb,
  offlineScopeKey,
  type NamedSnapshot,
} from '../pos/offline/offline-db';
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

interface TeamManagementSnapshot {
  company_id: string;
  members: MembershipWithRole[];
  roles: Role[];
  locations: TeamLocation[];
  membership_locations: MembershipLocation[];
  generated_at: string;
}

const TEAM_CONSUMER = 'team-snapshot';
const SETTINGS_CONSUMER = 'team-settings';

export { ALL_PERMISSIONS, PERMISSION_LABELS } from '../core/permissions.service';

/**
 * Identity-scoped Team projection. IndexedDB is only a render accelerator: the
 * permission-checked RPC remains authoritative and journal events always
 * rebuild the complete projection.
 */
@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly supabase = inject(SupabaseService);
  private readonly permissions = inject(PermissionsService);
  private readonly journal = inject(CacheJournalService);

  readonly members = signal<MembershipWithRole[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly locations = signal<TeamLocation[]>([]);
  readonly membershipLocations = signal<MembershipLocation[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private identity: AppIdentity | null = null;
  private scope: string | null = null;
  private teamChannel: RealtimeChannel | null = null;
  private settingsChannel: RealtimeChannel | null = null;
  private refreshRequest: Promise<void> | null = null;
  private refreshScope: string | null = null;

  private readonly teamHandler: CacheStreamHandler = {
    apply: () => this.refresh(true),
    reset: async () => {
      await this.refresh(true);
      return true;
    },
    purge: () => this.clearLive(),
  };

  private readonly settingsHandler: CacheStreamHandler = {
    apply: changes => this.applySettingsChanges(changes),
    reset: async () => {
      await this.refresh(true);
      return true;
    },
    purge: () => this.clearLive(),
  };

  constructor() {
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const permissionsReady = this.permissions.ready();
      const canManageTeam = permissionsReady && this.permissions.has('ManageTeam');

      if (!identity || (this.identity && !sameIdentity(identity, this.identity))) {
        void this.deactivate(true);
        return;
      }
      // Do not purge during the permission service's short fail-closed reload;
      // purge immediately once the refreshed authoritative snapshot revokes it.
      if (this.identity && permissionsReady && !canManageTeam) void this.deactivate(true);
    });
  }

  private get db() {
    return this.supabase.client;
  }

  /** Hydrate first, subscribe second, then reconcile without blocking render. */
  async start(): Promise<void> {
    const identity = this.supabase.offlineIdentity();
    if (
      !identity ||
      !(await this.permissions.ensureLoaded()) ||
      !this.permissions.has('ManageTeam')
    ) {
      if (this.identity) await this.deactivate(true);
      throw new Error('permission_denied: ManageTeam required');
    }

    const scope = offlineScopeKey(identity);
    if (scope === this.scope) return;
    if (this.identity) await this.deactivate(true);

    this.identity = identity;
    this.scope = scope;
    this.loading.set(true);
    const hydrated = await this.hydrate(scope, identity);
    if (hydrated) this.loading.set(false);

    if (!this.isCurrent(scope, identity) || !this.permissions.has('ManageTeam')) return;
    this.teamChannel = this.journal.subscribe(
      'team',
      scope,
      identity.companyId,
      this.teamHandler,
      TEAM_CONSUMER
    );
    this.settingsChannel = this.journal.subscribe(
      'settings',
      scope,
      identity.companyId,
      this.settingsHandler,
      SETTINGS_CONSUMER
    );
    void this.refresh()
      .catch(error => {
        if (this.members().length === 0) {
          this.error.set(error instanceof Error ? error.message : 'Failed to load team');
        }
      })
      .finally(() => this.loading.set(false));
  }

  /** One shared in-flight RPC per active company/account scope. */
  refresh(afterCurrent = false): Promise<void> {
    const scope = this.scope;
    const identity = this.identity;
    if (!scope || !identity || !this.permissions.has('ManageTeam')) {
      return Promise.reject(new Error('permission_denied: ManageTeam required'));
    }
    if (this.refreshRequest && this.refreshScope === scope) {
      if (!afterCurrent) return this.refreshRequest;
      return this.refreshRequest.then(
        () => (this.isCurrent(scope, identity) ? this.refresh() : undefined),
        error => (this.isCurrent(scope, identity) ? this.refresh() : Promise.reject(error))
      );
    }

    this.loading.set(this.members().length === 0);
    const request = this.fetchAndCommit(scope, identity).finally(() => {
      if (this.refreshRequest === request) {
        this.refreshRequest = null;
        this.refreshScope = null;
        this.loading.set(false);
      }
    });
    this.refreshRequest = request;
    this.refreshScope = scope;
    return request;
  }

  private async fetchAndCommit(scope: string, identity: AppIdentity): Promise<void> {
    const { data, error } = await this.db.rpc('team_management_snapshot');
    if (error) {
      if (/permission_denied|not_authenticated/i.test(error.message)) await this.deactivate(true);
      throw rpcError(error);
    }
    const snapshot = data as unknown as TeamManagementSnapshot;
    if (!validSnapshot(snapshot, identity.companyId) || !this.isCurrent(scope, identity)) return;
    this.commit(snapshot);
    this.error.set(null);

    const cached: NamedSnapshot = {
      key: `${scope}:team`,
      name: 'team',
      company_id: identity.companyId,
      user_id: identity.userId,
      value: snapshot,
      fetched_at: new Date().toISOString(),
    };
    await (await offlineDb()).put('snapshots', cached);
    if (!this.isCurrent(scope, identity) || !this.permissions.has('ManageTeam')) {
      await this.purgePersisted(scope);
      this.clearLive();
    }
  }

  private async hydrate(scope: string, identity: AppIdentity): Promise<boolean> {
    const cached = await (await offlineDb()).get('snapshots', `${scope}:team`);
    const snapshot = cached?.value as TeamManagementSnapshot | undefined;
    if (
      !cached ||
      cached.company_id !== identity.companyId ||
      cached.user_id !== identity.userId ||
      !validSnapshot(snapshot, identity.companyId) ||
      !this.isCurrent(scope, identity)
    ) {
      return false;
    }
    this.commit(snapshot);
    return true;
  }

  private commit(snapshot: TeamManagementSnapshot): void {
    this.members.set(snapshot.members);
    this.roles.set(snapshot.roles);
    this.locations.set(snapshot.locations);
    this.membershipLocations.set(snapshot.membership_locations);
  }

  private applySettingsChanges(changes: readonly CacheChange[]): Promise<void> {
    return changes.some(change => change.entityType === 'location')
      ? this.refresh(true)
      : Promise.resolve();
  }

  private isCurrent(scope: string, identity: AppIdentity): boolean {
    const current = this.supabase.offlineIdentity();
    return (
      this.scope === scope &&
      !!current &&
      sameIdentity(current, identity) &&
      this.permissions.has('ManageTeam')
    );
  }

  private async deactivate(purge: boolean): Promise<void> {
    const scope = this.scope;
    const teamChannel = this.teamChannel;
    const settingsChannel = this.settingsChannel;
    if (scope) {
      this.journal.unsubscribe('team', scope, this.teamHandler, TEAM_CONSUMER);
      this.journal.unsubscribe('settings', scope, this.settingsHandler, SETTINGS_CONSUMER);
    }
    this.teamChannel = null;
    this.settingsChannel = null;
    this.identity = null;
    this.scope = null;
    this.refreshRequest = null;
    this.refreshScope = null;
    this.clearLive();
    if (teamChannel) await this.supabase.client.removeChannel(teamChannel);
    if (settingsChannel) await this.supabase.client.removeChannel(settingsChannel);
    if (purge && scope) await this.purgePersisted(scope);
  }

  private clearLive(): void {
    this.members.set([]);
    this.roles.set([]);
    this.locations.set([]);
    this.membershipLocations.set([]);
    this.loading.set(false);
  }

  private async purgePersisted(scope: string): Promise<void> {
    const db = await offlineDb();
    const tx = db.transaction(['snapshots', 'watermarks'], 'readwrite');
    await tx.objectStore('snapshots').delete(`${scope}:team`);
    await tx
      .objectStore('watermarks')
      .delete(cacheWatermarkKey(`${scope}:consumer:${TEAM_CONSUMER}`, 'team'));
    await tx
      .objectStore('watermarks')
      .delete(cacheWatermarkKey(`${scope}:consumer:${SETTINGS_CONSUMER}`, 'settings'));
    await tx.done;
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

function sameIdentity(left: AppIdentity, right: AppIdentity): boolean {
  return left.companyId === right.companyId && left.userId === right.userId;
}

function validSnapshot(
  snapshot: TeamManagementSnapshot | undefined,
  companyId: string
): snapshot is TeamManagementSnapshot {
  return (
    !!snapshot &&
    snapshot.company_id === companyId &&
    Array.isArray(snapshot.members) &&
    Array.isArray(snapshot.roles) &&
    Array.isArray(snapshot.locations) &&
    Array.isArray(snapshot.membership_locations)
  );
}
