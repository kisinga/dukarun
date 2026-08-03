import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { normalizeKenyanPhone } from '../core/phone';
import { ALL_PERMISSIONS, MembershipWithRole, Role, TeamService } from './team.service';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { EntitlementsService } from '../core/entitlements.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-team',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    DeleteConfirmationModalComponent,
    EntityAvatarComponent,
    PaginationComponent,
    RouterLink,
  ],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="page">
        <app-page-header title="Team">
          <button actions class="btn btn-ghost btn-sm ml-auto" (click)="load()">Refresh</button>
        </app-page-header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        <!-- Add member -->
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <h2 class="card-title text-lg">Add member</h2>
            <p class="text-xs text-base-content/60">
              The person must have logged in at least once before they can be added.
            </p>
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
              class="mt-2 flex flex-wrap items-end gap-3"
            >
              <label class="form-control">
                <span class="label-text">Phone</span>
                <input
                  type="tel"
                  class="input input-bordered input-sm"
                  placeholder="0712 345 678"
                  [formControl]="memberPhone"
                />
              </label>
              <label class="form-control">
                <span class="label-text">Role</span>
                <select class="select select-bordered select-sm" [formControl]="memberRole">
                  @for (r of roles(); track r.id) {
                    <option [value]="r.id">{{ r.name }}</option>
                  }
                </select>
              </label>
              <button
                type="submit"
                class="btn btn-primary btn-sm"
                [disabled]="busy() || roles().length === 0 || !canAddMember()"
              >
                {{ busy() ? 'Adding…' : 'Add member' }}
              </button>
            </form>
          </div>
        </div>

        <!-- Members -->
        <h2 class="mb-2 text-lg font-semibold">Members</h2>
        <div class="card mb-4 bg-base-100">
          <div class="table-scroll">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th class="hidden sm:table-cell">Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (m of pagedMembers(); track m.id) {
                  <tr>
                    <td>
                      <div class="flex items-center gap-2">
                        <app-entity-avatar size="sm" [firstName]="m.roles?.name ?? '?'" />
                        <span class="font-mono text-xs" [title]="m.user_id">
                          User …{{ shortId(m.user_id) }}
                        </span>
                      </div>
                    </td>
                    <td>{{ m.roles?.name ?? '—' }}</td>
                    <td>
                      <app-status-badge
                        [type]="memberStatusType(m.authorization_status)"
                        [label]="m.authorization_status"
                      />
                    </td>
                    <td class="hidden text-xs sm:table-cell">{{ date(m.created_at) }}</td>
                    <td class="whitespace-nowrap text-right">
                      @if (m.authorization_status === 'disabled') {
                        <button
                          class="btn btn-success btn-outline btn-xs"
                          [disabled]="busy() || !canAddMember()"
                          (click)="setStatus(m, 'approved')"
                        >
                          Enable
                        </button>
                      } @else {
                        <button
                          class="btn btn-warning btn-outline btn-xs"
                          [disabled]="busy()"
                          (click)="setStatus(m, 'disabled')"
                        >
                          Disable
                        </button>
                      }
                      <button
                        class="btn btn-error btn-outline btn-xs"
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
          </div>
          <div class="p-3 pt-0">
            <app-pagination
              [currentPage]="memberPage()"
              [totalPages]="memberTotalPages()"
              [totalItems]="members().length"
              [itemsPerPage]="memberPageSize()"
              itemLabel="members"
              [showItemsPerPage]="true"
              (pageChange)="memberPage.set($event)"
              (itemsPerPageChange)="memberPageSize.set($event); memberPage.set(1)"
            />
          </div>
        </div>

        <!-- Roles -->
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-lg font-semibold">Roles</h2>
          <button class="btn btn-ghost btn-sm" (click)="startRoleCreate()">+ New role</button>
        </div>

        @if (roleFormOpen()) {
          <div class="card mb-4 bg-base-100">
            <div class="card-body p-4">
              <h3 class="card-title text-base">
                {{ editingRole() ? 'Edit ' + editingRole()!.name : 'New role' }}
              </h3>
              <form (submit)="$event.preventDefault(); saveRole()" class="mt-2 flex flex-col gap-3">
                <label class="form-control max-w-xs">
                  <span class="label-text">Name *</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="roleName"
                  />
                </label>
                <div class="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  @for (perm of allPermissions; track perm) {
                    <label class="label cursor-pointer justify-start gap-2 py-0">
                      <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        [checked]="rolePermissions().has(perm)"
                        (change)="togglePermission(perm)"
                      />
                      <span class="label-text text-xs">{{ perm }}</span>
                    </label>
                  }
                </div>
                <div class="flex gap-2">
                  <button
                    type="submit"
                    class="btn btn-primary btn-sm"
                    [disabled]="busy() || roleName.value.trim().length === 0"
                  >
                    {{ busy() ? 'Saving…' : editingRole() ? 'Save role' : 'Create role' }}
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" (click)="closeRoleForm()">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        }

        <div class="flex flex-col gap-2">
          @for (r of roles(); track r.id) {
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex items-center gap-3">
                  <span class="font-semibold">{{ r.name }}</span>
                  @if (r.is_template) {
                    <span class="badge badge-xs badge-outline">template</span>
                  }
                  <button class="btn btn-ghost btn-xs ml-auto" (click)="startRoleEdit(r)">
                    Edit
                  </button>
                </div>
                <div class="mt-1 flex flex-wrap gap-1">
                  @for (perm of r.permissions; track perm) {
                    <span class="badge badge-xs badge-ghost">{{ perm }}</span>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      </div>

      <app-delete-confirmation-modal
        [data]="removeData()"
        title="Remove team member?"
        entityType="member"
        verb="remove"
        confirmButtonText="Remove"
        (confirm)="confirmRemove()"
      />
    </main>
  `,
})
export class TeamComponent implements OnInit {
  private readonly team = inject(TeamService);
  protected readonly entitlements = inject(EntitlementsService);

  protected readonly allPermissions = ALL_PERMISSIONS;
  protected readonly members = signal<MembershipWithRole[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly memberPage = signal(1);
  protected readonly memberPageSize = signal(10);
  protected readonly memberTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.members().length / this.memberPageSize()))
  );
  protected readonly pagedMembers = computed(() => {
    const page = Math.min(this.memberPage(), this.memberTotalPages());
    const start = (page - 1) * this.memberPageSize();
    return this.members().slice(start, start + this.memberPageSize());
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
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly memberLimit = computed(() => this.entitlements.limit('maxAdmins'));
  protected readonly activeMemberCount = computed(
    () => this.members().filter(member => member.authorization_status === 'approved').length
  );
  protected readonly canAddMember = computed(() => {
    const limit = this.memberLimit();
    return limit === null || this.activeMemberCount() < limit;
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const [members, roles] = await Promise.all([this.team.memberships(), this.team.roles()]);
      this.members.set(members);
      this.roles.set(roles);
      if (!this.memberRole.value && roles.length > 0) this.memberRole.setValue(roles[0].id);
      this.error.set(null);
      await this.entitlements.refresh();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load team');
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
