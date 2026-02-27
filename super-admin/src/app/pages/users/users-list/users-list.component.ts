import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApolloService } from '../../../core/services/apollo.service';
import {
  PLATFORM_CHANNELS,
  PLATFORM_ADMINISTRATORS,
  ADMINISTRATOR_DETAIL,
  ASSIGNABLE_PERMISSIONS,
  ROLE_TEMPLATES,
  UPDATE_ADMINISTRATOR_PERMISSIONS,
} from '../../../core/graphql/operations';
import { groupPermissions, formatPermissionName } from '../../../core/utils/permission-grouping';

interface PlatformAdministratorItem {
  id: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  userId: string;
  identifier: string;
  authorizationStatus: string;
  roleCodes: string[];
  channelIds?: string[] | null;
  isSuperAdmin?: boolean | null;
}

interface PlatformChannelBasic {
  id: string;
  code: string;
}

interface AdminRoleDetail {
  id: string;
  code: string;
  channelIds: string[];
  permissions: string[];
}

interface AdministratorDetail {
  id: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  userId: string;
  identifier: string;
  authorizationStatus: string;
  isSuperAdmin: boolean;
  roles: AdminRoleDetail[];
}

interface RoleTemplateItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
}

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './users-list.component.html',
  styleUrl: './users-list.component.scss',
})
export class UsersListComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  items = signal<PlatformAdministratorItem[]>([]);
  totalItems = signal(0);
  channels = signal<PlatformChannelBasic[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  filterChannelId = signal<string>('');
  filterSuperAdminOnly = signal(false);
  skip = signal(0);
  take = 50;

  permModalOpen = signal(false);
  permLoading = signal(false);
  permSaving = signal(false);
  permError = signal<string | null>(null);
  permDetail = signal<AdministratorDetail | null>(null);
  permAssignable = signal<string[]>([]);
  permTemplates = signal<RoleTemplateItem[]>([]);
  selectedChannelId = signal<string>('');
  selectedPermissions = signal<Set<string>>(new Set());

  groupedPermissions = computed(() => groupPermissions(this.permAssignable()));
  permGroupKeys = computed(() => Object.keys(this.groupedPermissions()));
  permissionChannels = computed(() => {
    const detail = this.permDetail();
    if (!detail) return [];
    const channelIds = new Set<string>();
    for (const r of detail.roles) {
      for (const cid of r.channelIds) channelIds.add(cid);
    }
    return Array.from(channelIds);
  });
  currentRoleForChannel = computed(() => {
    const detail = this.permDetail();
    const chId = this.selectedChannelId();
    if (!detail || !chId) return null;
    return detail.roles.find((r) => r.channelIds.includes(chId)) ?? null;
  });

  readonly formatPermissionName = formatPermissionName;

  async ngOnInit(): Promise<void> {
    const client = this.apollo.getClient();
    try {
      const [chResult, adminsResult] = await Promise.all([
        client.query<{ platformChannels: PlatformChannelBasic[] }>({
          query: PLATFORM_CHANNELS,
          fetchPolicy: 'network-only',
        }),
        this.loadAdmins(),
      ]);
      this.channels.set(
        (chResult.data?.platformChannels ?? []).map((c) => ({ id: c.id, code: c.code }))
      );
      const data = adminsResult.data?.platformAdministrators;
      this.items.set(data?.items ?? []);
      this.totalItems.set(data?.totalItems ?? 0);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      this.loading.set(false);
    }
  }

  private loadAdmins(): Promise<{ data?: { platformAdministrators: { items: PlatformAdministratorItem[]; totalItems: number } } }> {
    const client = this.apollo.getClient();
    const channelId = this.filterChannelId() || undefined;
    const superAdminOnly = this.filterSuperAdminOnly();
    return client.query<{
      platformAdministrators: { items: PlatformAdministratorItem[]; totalItems: number };
    }>({
      query: PLATFORM_ADMINISTRATORS,
      variables: {
        options: {
          skip: this.skip(),
          take: this.take,
          channelId: channelId || null,
          superAdminOnly: superAdminOnly || null,
        },
      },
      fetchPolicy: 'network-only',
    });
  }

  async applyFilters(): Promise<void> {
    this.loading.set(true);
    this.skip.set(0);
    try {
      const result = await this.loadAdmins();
      const data = result.data?.platformAdministrators;
      this.items.set(data?.items ?? []);
      this.totalItems.set(data?.totalItems ?? 0);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  channelsLabel(admin: PlatformAdministratorItem): string {
    if (admin.isSuperAdmin) return 'Global';
    const ids = admin.channelIds ?? [];
    if (ids.length === 0) return '—';
    return ids.length === 1 ? ids[0] : `${ids.length} channels`;
  }

  channelCode(id: string): string {
    return this.channels().find((c) => c.id === id)?.code ?? id;
  }

  async openEditPermissions(admin: PlatformAdministratorItem): Promise<void> {
    if (admin.isSuperAdmin) return;
    this.permModalOpen.set(true);
    this.permError.set(null);
    this.permDetail.set(null);
    this.permLoading.set(true);
    try {
      const client = this.apollo.getClient();
      const [detailRes, permRes, templatesRes] = await Promise.all([
        client.query<{ administratorDetail: AdministratorDetail }>({
          query: ADMINISTRATOR_DETAIL,
          variables: { administratorId: admin.id },
          fetchPolicy: 'network-only',
        }),
        client.query<{ assignablePermissions: string[] }>({
          query: ASSIGNABLE_PERMISSIONS,
          fetchPolicy: 'network-only',
        }),
        client.query<{ platformRoleTemplates: RoleTemplateItem[] }>({
          query: ROLE_TEMPLATES,
          fetchPolicy: 'network-only',
        }),
      ]);
      const detail = detailRes.data?.administratorDetail;
      if (!detail) {
        this.permError.set('Administrator not found');
        return;
      }
      this.permDetail.set(detail);
      this.permAssignable.set(permRes.data?.assignablePermissions ?? []);
      this.permTemplates.set(templatesRes.data?.platformRoleTemplates ?? []);
      const chIds = Array.from(new Set(detail.roles.flatMap((r) => r.channelIds)));
      const firstCh = chIds[0] ?? '';
      this.selectedChannelId.set(firstCh);
      const role = detail.roles.find((r) => r.channelIds.includes(firstCh));
      this.selectedPermissions.set(new Set(role?.permissions ?? []));
    } catch (err: unknown) {
      this.permError.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.permLoading.set(false);
    }
  }

  onPermChannelChange(channelId: string): void {
    this.selectedChannelId.set(channelId);
    const detail = this.permDetail();
    const role = detail?.roles.find((r) => r.channelIds.includes(channelId));
    this.selectedPermissions.set(new Set(role?.permissions ?? []));
  }

  permTogglePermission(perm: string): void {
    const next = new Set(this.selectedPermissions());
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    this.selectedPermissions.set(next);
  }

  permHasPermission(perm: string): boolean {
    return this.selectedPermissions().has(perm);
  }

  onTemplateSelect(index: number): void {
    const templates = this.permTemplates();
    if (index >= 0 && index < templates.length) {
      this.selectedPermissions.set(new Set(templates[index].permissions));
    }
  }

  applyTemplate(template: RoleTemplateItem): void {
    this.selectedPermissions.set(new Set(template.permissions));
  }

  closePermModal(): void {
    this.permModalOpen.set(false);
  }

  async savePermissions(): Promise<void> {
    const adminId = this.permDetail()?.id;
    const channelId = this.selectedChannelId();
    if (!adminId || !channelId) return;
    const permissions = Array.from(this.selectedPermissions());
    this.permSaving.set(true);
    this.permError.set(null);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_ADMINISTRATOR_PERMISSIONS,
        variables: { administratorId: adminId, channelId, permissions },
      });
      this.closePermModal();
    } catch (err: unknown) {
      this.permError.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.permSaving.set(false);
    }
  }
}
