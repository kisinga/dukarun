import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApolloService } from '../../core/services/apollo.service';
import {
  ROLE_TEMPLATES,
  ASSIGNABLE_PERMISSIONS,
  CREATE_ROLE_TEMPLATE,
  UPDATE_ROLE_TEMPLATE,
  DELETE_ROLE_TEMPLATE,
} from '../../core/graphql/operations.graphql';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { groupPermissions, formatPermissionName } from '../../core/utils/permission-grouping';

export interface RoleTemplateItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
}

@Component({
  selector: 'app-role-templates-list',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent],
  templateUrl: './role-templates-list.component.html',
  styleUrl: './role-templates-list.component.scss',
})
export class RoleTemplatesListComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  templates = signal<RoleTemplateItem[]>([]);
  assignablePermissions = signal<string[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  saving = signal(false);
  modalOpen = signal(false);
  editingId = signal<string | null>(null);

  formCode = signal('');
  formName = signal('');
  formDescription = signal('');
  formPermissions = signal<Set<string>>(new Set());

  groupedPermissions = computed(() => groupPermissions(this.assignablePermissions()));
  groupKeys = computed(() => Object.keys(this.groupedPermissions()));

  readonly formatName = formatPermissionName;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const client = this.apollo.getClient();
      const [tRes, pRes] = await Promise.all([
        client.query<{ platformRoleTemplates: RoleTemplateItem[] }>({
          query: ROLE_TEMPLATES,
          fetchPolicy: 'network-only',
        }),
        client.query<{ assignablePermissions: string[] }>({
          query: ASSIGNABLE_PERMISSIONS,
          fetchPolicy: 'network-only',
        }),
      ]);
      this.templates.set(tRes.data?.platformRoleTemplates ?? []);
      this.assignablePermissions.set(pRes.data?.assignablePermissions ?? []);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formCode.set('');
    this.formName.set('');
    this.formDescription.set('');
    this.formPermissions.set(new Set());
    this.modalOpen.set(true);
  }

  openEdit(t: RoleTemplateItem): void {
    this.editingId.set(t.id);
    this.formCode.set(t.code);
    this.formName.set(t.name);
    this.formDescription.set(t.description ?? '');
    this.formPermissions.set(new Set(t.permissions));
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  togglePermission(perm: string): void {
    const next = new Set(this.formPermissions());
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    this.formPermissions.set(next);
  }

  hasPermission(perm: string): boolean {
    return this.formPermissions().has(perm);
  }

  isEditMode(): boolean {
    return this.editingId() != null;
  }

  async save(): Promise<void> {
    const code = this.formCode().trim();
    const name = this.formName().trim();
    if (!code || !name) return;
    const permissions = Array.from(this.formPermissions());
    this.saving.set(true);
    try {
      const client = this.apollo.getClient();
      const id = this.editingId();
      if (id) {
        await client.mutate({
          mutation: UPDATE_ROLE_TEMPLATE,
          variables: {
            id,
            input: {
              name,
              description: this.formDescription().trim() || undefined,
              permissions,
            },
          },
        });
      } else {
        await client.mutate({
          mutation: CREATE_ROLE_TEMPLATE,
          variables: {
            input: {
              code,
              name,
              description: this.formDescription().trim() || undefined,
              permissions,
            },
          },
        });
      }
      this.closeModal();
      await this.load();
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  async deleteTemplate(t: RoleTemplateItem): Promise<void> {
    if (!confirm(`Delete template "${t.name}" (${t.code})? This will fail if any role is linked to it.`)) return;
    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: DELETE_ROLE_TEMPLATE,
        variables: { id: t.id },
      });
      await this.load();
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      this.saving.set(false);
    }
  }
}
