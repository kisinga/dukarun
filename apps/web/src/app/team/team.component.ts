import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { normalizeKenyanPhone } from '../core/phone';
import {
  ALL_PERMISSIONS,
  MembershipWithRole,
  PERMISSION_LABELS,
  Role,
  TeamService,
} from './team.service';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { EntitlementsService } from '../core/entitlements.service';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';

@Component({
  selector: 'app-team',
  imports: [
    ReactiveFormsModule,
    PageLayoutComponent,
    StatusBadgeComponent,
    DeleteConfirmationModalComponent,
    EntityAvatarComponent,
    PaginationComponent,
    RouterLink,
    ButtonComponent,
    IconComponent,
    DataTableShellComponent,
    FormFieldComponent,
    ListSearchBarComponent,
    StatBarComponent,
    EmptyStateComponent,
  ],
  template: `
    <app-page
      title="Team"
      subtitle="Manage member access, account status, roles, and permissions."
      [wide]="true"
    >
      <button
        actions
        appButton
        variant="ghost"
        [iconOnly]="true"
        [loading]="loading()"
        type="button"
        title="Refresh team"
        aria-label="Refresh team"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>
      <button actions appButton type="button" (click)="memberFormOpen.set(true)">
        <app-icon name="heroPlus" /> Add member
      </button>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (notice()) {
        <div role="status" class="alert alert-success mb-3 text-sm">
          <app-icon name="heroCheckCircle" />
          <span>{{ notice() }}</span>
        </div>
      }

      <!-- Add member -->
      @if (memberFormOpen()) {
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="section-title">Add member</h2>
                <p class="type-caption mt-1">
                  The person must have logged in at least once before they can be added.
                </p>
              </div>
              <button
                appButton
                variant="ghost"
                [iconOnly]="true"
                type="button"
                aria-label="Close add member form"
                (click)="memberFormOpen.set(false)"
              >
                <app-icon name="heroXMark" />
              </button>
            </div>
            @if (!canAddMember()) {
              <div class="alert mt-2 border border-warning/20 bg-warning/5 text-sm">
                <span class="flex-1">
                  Your plan allows {{ memberLimit() }} active team member(s). Disable a member or
                  upgrade to add another.
                </span>
                <a routerLink="/billing" class="link whitespace-nowrap font-semibold">View plans</a>
              </div>
            }
            <form
              (submit)="$event.preventDefault(); addMember()"
              class="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
            >
              <app-form-field label="Phone" [required]="true">
                <input
                  type="tel"
                  class="input input-bordered input-sm w-full"
                  placeholder="0712 345 678"
                  [formControl]="memberPhone"
                />
              </app-form-field>
              <app-form-field label="Role" [required]="true">
                <select class="select select-bordered select-sm w-full" [formControl]="memberRole">
                  @for (r of roles(); track r.id) {
                    <option [value]="r.id">{{ r.name }}</option>
                  }
                </select>
              </app-form-field>
              <button
                appButton
                type="submit"
                size="sm"
                [disabled]="busy() || roles().length === 0 || !canAddMember()"
                [loading]="busy()"
              >
                Add member
              </button>
            </form>
          </div>
        </div>
      }

      <!-- Members -->
      <app-list-search-bar
        placeholder="Search member, role, or status…"
        [searchQuery]="memberQuery()"
        (searchQueryChange)="memberQuery.set($event); memberPage.set(1)"
      >
        <app-stat-bar summary [stats]="teamStats()" />
      </app-list-search-bar>

      @if (filteredMembers().length === 0) {
        <app-empty-state
          [compact]="true"
          icon="heroUsers"
          [title]="memberQuery() ? 'No matching members' : 'No team members yet'"
          description="Add a member from the page header."
        />
      } @else {
        <div class="hidden lg:block">
          <app-data-table-shell
            title="Members"
            [description]="filteredMembers().length + ' members'"
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (m of pagedMembers(); track m.id) {
                  <tr>
                    <td>
                      <div class="table-entity">
                        <app-entity-avatar size="sm" [firstName]="m.roles?.name ?? '?'" />
                        <div>
                          <p class="table-primary font-mono" [title]="m.user_id">
                            User …{{ shortId(m.user_id) }}
                          </p>
                          <p class="table-secondary">Team member</p>
                        </div>
                      </div>
                    </td>
                    <td>{{ m.roles?.name ?? '—' }}</td>
                    <td>
                      <app-status-badge
                        size="xs"
                        [type]="memberStatusType(m.authorization_status)"
                        [label]="m.authorization_status"
                      />
                    </td>
                    <td>{{ date(m.created_at) }}</td>
                    <td class="table-actions">
                      @if (m.authorization_status === 'disabled') {
                        <button
                          appButton
                          variant="outline"
                          size="sm"
                          [disabled]="busy() || !canAddMember()"
                          (click)="setStatus(m, 'approved')"
                        >
                          Enable
                        </button>
                      } @else {
                        <button
                          appButton
                          variant="outline"
                          size="sm"
                          [disabled]="busy()"
                          (click)="setStatus(m, 'disabled')"
                        >
                          Disable
                        </button>
                      }
                      <button
                        appButton
                        variant="ghost"
                        size="sm"
                        class="ml-1 text-error"
                        [disabled]="busy()"
                        (click)="startRemove(m)"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <div class="flex flex-col gap-2 lg:hidden">
          @for (m of pagedMembers(); track m.id) {
            <div class="card bg-base-100">
              <div class="card-body gap-3 p-4">
                <div class="flex items-center gap-3">
                  <app-entity-avatar size="sm" [firstName]="m.roles?.name ?? '?'" />
                  <div class="min-w-0 flex-1">
                    <p class="font-mono text-sm font-semibold" [title]="m.user_id">
                      User …{{ shortId(m.user_id) }}
                    </p>
                    <p class="type-caption mt-0.5">{{ m.roles?.name ?? 'No role' }}</p>
                  </div>
                  <app-status-badge
                    size="xs"
                    [type]="memberStatusType(m.authorization_status)"
                    [label]="m.authorization_status"
                  />
                </div>
                <div class="flex items-center gap-2 border-t border-base-300/60 pt-3">
                  <span class="type-caption">Joined {{ date(m.created_at) }}</span>
                  @if (m.authorization_status === 'disabled') {
                    <button
                      appButton
                      variant="outline"
                      size="sm"
                      class="ml-auto"
                      [disabled]="busy() || !canAddMember()"
                      (click)="setStatus(m, 'approved')"
                    >
                      Enable
                    </button>
                  } @else {
                    <button
                      appButton
                      variant="outline"
                      size="sm"
                      class="ml-auto"
                      [disabled]="busy()"
                      (click)="setStatus(m, 'disabled')"
                    >
                      Disable
                    </button>
                  }
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    class="text-error"
                    [disabled]="busy()"
                    (click)="startRemove(m)"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          }
        </div>

        <div class="mt-3 mb-6">
          <app-pagination
            [currentPage]="memberPage()"
            [totalPages]="memberTotalPages()"
            [totalItems]="filteredMembers().length"
            [itemsPerPage]="memberPageSize()"
            itemLabel="members"
            [showItemsPerPage]="true"
            (pageChange)="memberPage.set($event)"
            (itemsPerPageChange)="memberPageSize.set($event); memberPage.set(1)"
          />
        </div>
      }

      <!-- Roles -->
      <div class="mb-2 flex items-center justify-between">
        <div>
          <h2 class="section-title">Roles</h2>
          <p class="type-caption mt-1">Permission bundles assigned to team members.</p>
        </div>
        <button appButton variant="outline" size="sm" (click)="startRoleCreate()">
          <app-icon name="heroPlus" /> New role
        </button>
      </div>

      @if (roleFormOpen()) {
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <h3 class="card-title text-base">
              {{ editingRole() ? 'Edit ' + editingRole()!.name : 'New role' }}
            </h3>
            <form (submit)="$event.preventDefault(); saveRole()" class="mt-3 flex flex-col gap-3">
              <app-form-field label="Role name" [required]="true" class="max-w-xs">
                <input type="text" class="input input-bordered input-sm" [formControl]="roleName" />
              </app-form-field>
              <div class="grid grid-cols-2 gap-1 sm:grid-cols-3">
                @for (perm of allPermissions; track perm) {
                  <label class="label cursor-pointer justify-start gap-2 py-0">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      [checked]="rolePermissions().has(perm)"
                      (change)="togglePermission(perm)"
                    />
                    <span class="label-text text-xs">{{ permissionLabels[perm] }}</span>
                  </label>
                }
              </div>
              <div class="flex gap-2">
                <button
                  appButton
                  type="submit"
                  size="sm"
                  [loading]="busy()"
                  [disabled]="busy() || roleName.value.trim().length === 0"
                >
                  {{ editingRole() ? 'Save role' : 'Create role' }}
                </button>
                <button appButton variant="ghost" type="button" size="sm" (click)="closeRoleForm()">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <div class="grid gap-2 md:grid-cols-2">
        @for (r of roles(); track r.id) {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <div class="flex items-center gap-3">
                <span class="font-semibold">{{ r.name }}</span>
                @if (r.is_template) {
                  <span class="badge badge-xs badge-outline">template</span>
                }
                <button
                  appButton
                  variant="ghost"
                  size="sm"
                  class="ml-auto"
                  (click)="startRoleEdit(r)"
                >
                  <app-icon name="heroPencilSquare" /> Edit
                </button>
              </div>
              <div class="mt-1 flex flex-wrap gap-1">
                @for (perm of r.permissions; track perm) {
                  <span class="badge badge-xs badge-ghost">{{ permissionLabel(perm) }}</span>
                }
              </div>
            </div>
          </div>
        }
      </div>
      <app-delete-confirmation-modal
        [data]="removeData()"
        title="Remove team member?"
        entityType="member"
        verb="remove"
        confirmButtonText="Remove"
        (confirm)="confirmRemove()"
      />
    </app-page>
  `,
})
export class TeamComponent implements OnInit {
  private readonly team = inject(TeamService);
  protected readonly entitlements = inject(EntitlementsService);

  protected readonly allPermissions = ALL_PERMISSIONS;
  protected readonly permissionLabels = PERMISSION_LABELS;
  protected readonly members = signal<MembershipWithRole[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly memberFormOpen = signal(false);
  protected readonly memberQuery = signal('');
  protected readonly memberPage = signal(1);
  protected readonly memberPageSize = signal(10);
  protected readonly filteredMembers = computed(() => {
    const query = this.memberQuery().trim().toLowerCase();
    if (!query) return this.members();
    return this.members().filter(member =>
      [member.user_id, member.roles?.name ?? '', member.authorization_status]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  });
  protected readonly memberTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredMembers().length / this.memberPageSize()))
  );
  protected readonly pagedMembers = computed(() => {
    const page = Math.min(this.memberPage(), this.memberTotalPages());
    const start = (page - 1) * this.memberPageSize();
    return this.filteredMembers().slice(start, start + this.memberPageSize());
  });
  protected readonly removingMember = signal<MembershipWithRole | null>(null);
  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);

  protected readonly memberPhone = new FormControl('', { nonNullable: true });
  protected readonly memberRole = new FormControl('', { nonNullable: true });

  protected readonly roleFormOpen = signal(false);
  protected readonly editingRole = signal<Role | null>(null);
  protected readonly roleName = new FormControl('', { nonNullable: true });
  protected readonly rolePermissions = signal<Set<string>>(new Set());

  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected permissionLabel(permission: string): string {
    return PERMISSION_LABELS[permission as keyof typeof PERMISSION_LABELS] ?? permission;
  }
  protected readonly memberLimit = computed(() => this.entitlements.limit('maxAdmins'));
  protected readonly activeMemberCount = computed(
    () => this.members().filter(member => member.authorization_status === 'approved').length
  );
  protected readonly teamStats = computed(() => [
    { label: 'Members', value: this.members().length },
    { label: 'Active', value: this.activeMemberCount(), tone: 'success' as const },
    {
      label: 'Pending',
      value: this.members().filter(member => member.authorization_status === 'pending').length,
      tone: 'warning' as const,
    },
    { label: 'Roles', value: this.roles().length },
  ]);
  protected readonly canAddMember = computed(() => {
    const limit = this.memberLimit();
    return limit === null || this.activeMemberCount() < limit;
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [members, roles] = await Promise.all([this.team.memberships(), this.team.roles()]);
      this.members.set(members);
      this.roles.set(roles);
      if (!this.memberRole.value && roles.length > 0) this.memberRole.setValue(roles[0].id);
      this.error.set(null);
      await this.entitlements.refresh();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      this.loading.set(false);
    }
  }

  protected async addMember(): Promise<void> {
    const phone = normalizeKenyanPhone(this.memberPhone.value);
    if (!phone) {
      this.error.set('Enter a valid Kenyan number, e.g. 0712345678 or +254712345678');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.team.addTeamMember(phone, this.memberRole.value);
      this.notice.set(`Added ${phone}`);
      this.memberPhone.setValue('');
      this.memberFormOpen.set(false);
      await this.load();
    } catch (err) {
      // user_not_registered is the common one — show verbatim.
      this.error.set(err instanceof Error ? err.message : 'Add failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async setStatus(m: MembershipWithRole, status: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.team.updateTeamMember(m.id, { authorization_status: status });
      this.notice.set(`Member ${status}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected startRemove(m: MembershipWithRole): void {
    this.removingMember.set(m);
    this.deleteModal()?.show();
  }

  protected removeData() {
    const m = this.removingMember();
    return {
      entityName: m ? `User …${this.shortId(m.user_id)} (${m.roles?.name ?? 'no role'})` : '',
    };
  }

  protected async confirmRemove(): Promise<void> {
    const m = this.removingMember();
    if (!m) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.team.removeTeamMember(m.id);
      this.notice.set('Member removed');
      this.removingMember.set(null);
      this.deleteModal()?.hide();
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Remove failed');
      this.deleteModal()?.hide();
    } finally {
      this.busy.set(false);
    }
  }

  protected startRoleCreate(): void {
    this.editingRole.set(null);
    this.roleName.setValue('');
    this.rolePermissions.set(new Set());
    this.roleFormOpen.set(true);
  }

  protected startRoleEdit(role: Role): void {
    this.editingRole.set(role);
    this.roleName.setValue(role.name);
    this.rolePermissions.set(new Set(role.permissions));
    this.roleFormOpen.set(true);
  }

  protected closeRoleForm(): void {
    this.roleFormOpen.set(false);
    this.editingRole.set(null);
  }

  protected togglePermission(perm: string): void {
    this.rolePermissions.update(set => {
      const next = new Set(set);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }

  protected async saveRole(): Promise<void> {
    if (this.roleName.value.trim().length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const editing = this.editingRole();
      await this.team.upsertRole(
        this.roleName.value.trim(),
        [...this.rolePermissions()],
        editing?.id
      );
      this.notice.set(editing ? 'Role updated' : 'Role created');
      this.closeRoleForm();
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected memberStatusType(status: string): 'success' | 'warning' | 'neutral' {
    // approved is the normal state — quiet; only pending warns (needs action)
    return status === 'pending' ? 'warning' : 'neutral';
  }

  protected shortId(userId: string): string {
    return userId.slice(-4);
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  }
}
