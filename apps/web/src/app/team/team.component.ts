import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { normalizeKenyanPhone } from '../core/phone';
import {
  ALL_PERMISSIONS,
  MembershipWithRole,
  PERMISSION_LABELS,
  Role,
  TeamInvitation,
  TeamService,
} from './team.service';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { EntitlementsService } from '../core/entitlements.service';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService } from '../core/supabase.service';
import { ProfileService } from '../profile/profile.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../shared/ui/list-search-bar.component';
import { sortList } from '../shared/ui/list-sort';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import { WorkspaceNavigationComponent } from '../shared/ui/workspace-navigation.component';
import {
  canResendInvitation,
  invitationDeliveryHint,
  invitationDeliveryLabel,
  invitationDeliveryTone,
  invitationQueueFailureMessage,
  invitationResendTitle,
  isInvitationExpired,
} from './team-invitation-presentation';

const MEMBER_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: 'name', label: 'Member name' },
  { value: 'role', label: 'Role' },
  { value: 'status', label: 'Access status' },
  { value: 'joined', label: 'Date joined' },
];

@Component({
  selector: 'app-team',
  host: {
    '(document:click)': 'closeMemberMenu()',
    '(document:keydown.escape)': 'closeMemberMenu()',
    '(document:wheel)': 'closeMemberMenu()',
    '(document:touchmove)': 'closeMemberMenu()',
    '(window:resize)': 'closeMemberMenu()',
  },
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
    DrawerComponent,
    MobileListComponent,
    PageActionsComponent,
    WorkspaceNavigationComponent,
  ],
  template: `
    <app-page
      title="Team"
      subtitle="Manage member access, account status, roles, and permissions."
      [wide]="true"
    >
      <app-page-actions actions>
        <button
          utilityAction
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
        @if (activeTab() === 'members') {
          <button primaryAction appButton type="button" (click)="memberFormOpen.set(true)">
            <app-icon name="heroPlus" /> Add member
          </button>
        }
        @if (activeTab() === 'roles') {
          <button primaryAction appButton type="button" (click)="startRoleCreate()">
            <app-icon name="heroPlus" /> New role
          </button>
        }
      </app-page-actions>

      <app-workspace-navigation workspace="team" label="Team" />

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
      @if (warning()) {
        <div role="status" class="alert alert-warning mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ warning() }}</span>
        </div>
      }

      @if (activeTab() === 'members') {
        <!-- Add member -->
        @if (memberFormOpen()) {
          <app-drawer
            [open]="true"
            title="Add member"
            subtitle="Invite their verified phone number"
            [dirty]="memberFormDirty()"
            (closed)="resetMemberForm()"
          >
            <p class="type-caption">
              They will join this company automatically after signing in with the same phone number.
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
              id="add-member-form"
              (submit)="$event.preventDefault(); addMember()"
              class="mt-4 grid gap-3"
            >
              <app-form-field label="Name" [required]="true">
                <input
                  type="text"
                  class="input input-bordered input-sm w-full"
                  placeholder="e.g. Amina Wanjiku"
                  [formControl]="memberName"
                />
              </app-form-field>
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
            </form>
            <div drawerFooter class="flex justify-end gap-2">
              <button appButton variant="ghost" type="button" (click)="closeMemberForm()">
                Cancel
              </button>
              <button
                appButton
                type="submit"
                form="add-member-form"
                [disabled]="
                  busy() ||
                  roles().length === 0 ||
                  !canAddMember() ||
                  memberName.value.trim().length === 0
                "
                [loading]="busy()"
              >
                Add member
              </button>
            </div>
          </app-drawer>
        }

        <!-- Members -->
        <app-list-search-bar
          placeholder="Search member, role, or status…"
          [searchQuery]="memberQuery()"
          (searchQueryChange)="memberQuery.set($event); memberPage.set(1)"
          [sortOptions]="memberSortOptions"
          [sortKey]="memberSort()"
          (sortKeyChange)="memberSort.set($event); memberPage.set(1)"
          [sortDirection]="memberSortDirection()"
          (sortDirectionChange)="memberSortDirection.set($event); memberPage.set(1)"
        >
          <app-stat-bar summary [stats]="teamStats()" />
        </app-list-search-bar>

        @if (invitations().length > 0) {
          <section class="mb-3 rounded-box border border-warning/25 bg-warning/5 p-3">
            <div class="mb-2">
              <h2 class="text-sm font-semibold">Invitations</h2>
              <p class="type-caption">
                {{ activeInvitations().length }} awaiting sign-in
                @if (expiredInvitations().length > 0) {
                  · {{ expiredInvitations().length }} expired
                }
              </p>
            </div>
            <div class="grid gap-2">
              @for (invitation of displayedInvitations(); track invitation.id) {
                <div class="rounded-box border border-base-200 bg-base-100 px-3 py-3">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="table-primary">{{ invitation.display_name }}</p>
                      <p class="table-secondary">
                        {{ invitation.phone }} · {{ invitation.role_name }} ·
                        @if (invitationExpired(invitation)) {
                          expired {{ date(invitation.expires_at) }}
                        } @else {
                          expires {{ date(invitation.expires_at) }}
                        }
                      </p>
                      <div class="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          class="badge badge-sm"
                          [class.badge-success]="deliveryTone(invitation) === 'success'"
                          [class.badge-warning]="deliveryTone(invitation) === 'warning'"
                          [class.badge-error]="deliveryTone(invitation) === 'error'"
                          [class.badge-ghost]="deliveryTone(invitation) === 'neutral'"
                        >
                          {{ deliveryLabel(invitation) }}
                        </span>
                        <span class="type-caption">{{ deliveryHint(invitation) }}</span>
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      <button
                        appButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        [disabled]="busy() || !canResend(invitation)"
                        [title]="resendTitle(invitation)"
                        (click)="resendInvitation(invitation)"
                      >
                        {{ invitationExpired(invitation) ? 'Renew & resend' : 'Resend' }}
                      </button>
                      <button
                        appButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        [disabled]="busy()"
                        (click)="cancelInvitation(invitation.id, invitation.display_name)"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              }
            </div>
          </section>
        }

        @if (!loading() && filteredMembers().length === 0) {
          <app-empty-state
            [compact]="true"
            icon="heroUsers"
            [title]="memberQuery() ? 'No matching members' : 'No team members yet'"
            description="Add a member from the page header."
          />
        } @else {
          <div class="hidden lg:block">
            <app-data-table-shell
              heading="Members"
              [description]="filteredMembers().length + ' members'"
            >
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Locations</th>
                    <th>Joined</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (m of pagedMembers(); track m.id) {
                    <tr>
                      <td>
                        <div class="table-entity">
                          <app-entity-avatar
                            size="sm"
                            [firstName]="m.staff_profile?.display_name ?? m.roles?.name ?? '?'"
                            [imageUrl]="memberAvatarUrl(m)"
                          />
                          <div>
                            <p class="table-primary" [title]="m.user_id">
                              {{ memberNameFor(m) }}
                              @if (isSelf(m)) {
                                <span class="badge badge-xs badge-outline ml-1">You</span>
                              }
                              @if (isPrimaryContact(m)) {
                                <span class="badge badge-xs badge-primary ml-1"
                                  >Primary contact</span
                                >
                              }
                            </p>
                            <p class="table-secondary font-mono">User …{{ shortId(m.user_id) }}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          class="select select-bordered select-xs w-40"
                          [value]="m.role_id ?? ''"
                          [disabled]="busy() || roles().length === 0 || isSelf(m)"
                          [title]="
                            isSelf(m) ? 'Ask another admin to change your role' : 'Change role'
                          "
                          aria-label="Change role"
                          (change)="changeRole(m, $any($event.target))"
                        >
                          @if (!m.role_id) {
                            <option value="" disabled>No role</option>
                          }
                          @for (r of roles(); track r.id) {
                            <option [value]="r.id" [selected]="r.id === m.role_id">
                              {{ r.name }}
                            </option>
                          }
                        </select>
                      </td>
                      <td>
                        <app-status-badge
                          size="xs"
                          [type]="memberStatusType(m.authorization_status)"
                          [label]="m.authorization_status"
                        />
                      </td>
                      <td>
                        <p class="table-primary">{{ primaryLocationName(m) }}</p>
                        @if (additionalLocationCount(m) > 0) {
                          <p class="table-secondary">+{{ additionalLocationCount(m) }} more</p>
                        }
                      </td>
                      <td>{{ date(m.created_at) }}</td>
                      <td class="table-actions">
                        <button
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          type="button"
                          aria-haspopup="menu"
                          [attr.aria-label]="'Actions for ' + memberNameFor(m)"
                          [attr.aria-expanded]="memberMenuId() === m.id"
                          [attr.aria-controls]="
                            memberMenuId() === m.id ? 'member-actions-menu' : null
                          "
                          (click)="toggleMemberMenu(m, $event)"
                        >
                          <app-icon name="heroEllipsisVertical" />
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </app-data-table-shell>

            @if (memberActionMenu(); as menu) {
              <div
                id="member-actions-menu"
                class="fixed z-[80] max-h-[calc(100dvh-1.5rem)] w-56 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 text-left shadow-overlay"
                role="menu"
                [attr.aria-label]="'Actions for ' + memberNameFor(menu.member)"
                [style.top.px]="menu.top"
                [style.left.px]="menu.left"
                (click)="$event.stopPropagation()"
              >
                <button
                  class="menu-item"
                  role="menuitem"
                  type="button"
                  (click)="closeMemberMenu(); renameMember(menu.member)"
                >
                  Rename
                </button>
                <button
                  class="menu-item"
                  role="menuitem"
                  type="button"
                  (click)="closeMemberMenu(); editMemberLocations(menu.member)"
                >
                  Manage locations
                </button>
                <button
                  class="menu-item"
                  role="menuitem"
                  type="button"
                  [disabled]="
                    busy() || isPrimaryContact(menu.member) || !canBePrimaryContact(menu.member)
                  "
                  (click)="closeMemberMenu(); makePrimaryContact(menu.member)"
                >
                  Make primary contact
                </button>
                <button
                  class="menu-item"
                  role="menuitem"
                  type="button"
                  [disabled]="
                    busy() ||
                    isSelf(menu.member) ||
                    (menu.member.authorization_status === 'disabled' && !canAddMember())
                  "
                  (click)="
                    closeMemberMenu();
                    setStatus(
                      menu.member,
                      menu.member.authorization_status === 'disabled' ? 'approved' : 'disabled'
                    )
                  "
                >
                  {{ menu.member.authorization_status === 'disabled' ? 'Enable' : 'Disable' }}
                </button>
                <div class="my-1 border-t border-base-300/70" aria-hidden="true"></div>
                <button
                  class="menu-item text-error"
                  role="menuitem"
                  type="button"
                  [disabled]="busy() || isSelf(menu.member)"
                  (click)="closeMemberMenu(); startRemove(menu.member)"
                >
                  Remove member
                </button>
              </div>
            }
          </div>

          <app-mobile-list>
            @for (m of pagedMembers(); track m.id) {
              <div
                mobileListRow
                class="cursor-pointer"
                role="button"
                tabindex="0"
                (click)="selectedMemberId.set(m.id)"
                (keydown.enter)="selectedMemberId.set(m.id)"
              >
                <div class="flex min-h-20 items-center gap-3 p-3">
                  <app-entity-avatar
                    size="sm"
                    [firstName]="m.staff_profile?.display_name ?? m.roles?.name ?? '?'"
                    [imageUrl]="memberAvatarUrl(m)"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <p class="truncate font-semibold" [title]="m.user_id">
                        {{ memberNameFor(m) }}
                      </p>
                      @if (isSelf(m)) {
                        <span class="badge badge-xs badge-outline">You</span>
                      }
                      @if (isPrimaryContact(m)) {
                        <span class="badge badge-xs badge-primary">Primary</span>
                      }
                    </div>
                    <p class="type-caption mt-1 truncate">{{ m.roles?.name || 'No role' }}</p>
                  </div>
                  <app-status-badge
                    size="xs"
                    [type]="memberStatusType(m.authorization_status)"
                    [label]="m.authorization_status"
                  />
                </div>
              </div>
            }
          </app-mobile-list>

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
      }

      <!-- Roles -->
      @if (activeTab() === 'roles') {
        <div class="mb-2 flex items-center justify-between">
          <div>
            <h2 class="section-title">Roles</h2>
            <p class="type-caption mt-1">Permission bundles assigned to team members.</p>
          </div>
        </div>

        @if (roleFormOpen()) {
          <app-drawer
            [open]="true"
            [title]="editingRole() ? 'Edit ' + editingRole()!.name : 'New role'"
            subtitle="Choose only the access this role needs"
            [dirty]="roleFormDirty()"
            (closed)="closeRoleForm()"
          >
            <form
              id="role-form"
              (submit)="$event.preventDefault(); saveRole()"
              class="flex flex-col gap-4"
            >
              <app-form-field label="Role name" [required]="true" class="max-w-xs">
                <input type="text" class="input input-bordered input-sm" [formControl]="roleName" />
              </app-form-field>
              @for (group of permissionGroups; track group.label) {
                <fieldset class="rounded-box border border-base-300 p-3">
                  <legend class="px-1 text-sm font-semibold">{{ group.label }}</legend>
                  <div class="grid gap-1 sm:grid-cols-2">
                    @for (perm of group.permissions; track perm) {
                      <label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          [checked]="rolePermissions().has(perm)"
                          (change)="togglePermission(perm)"
                        />
                        <span>{{ permissionLabel(perm) }}</span>
                      </label>
                    }
                  </div>
                </fieldset>
              }
            </form>
            <div drawerFooter class="flex justify-end gap-2">
              <button appButton variant="ghost" type="button" (click)="cancelRoleForm()">
                Cancel
              </button>
              <button
                appButton
                type="submit"
                form="role-form"
                [loading]="busy()"
                [disabled]="busy() || roleName.value.trim().length === 0"
              >
                {{ editingRole() ? 'Save role' : 'Create role' }}
              </button>
            </div>
          </app-drawer>
        }

        <app-mobile-list>
          @for (r of roles(); track r.id) {
            <button
              mobileListRow
              type="button"
              class="flex min-h-20 w-full items-center gap-3 p-3 text-left"
              (click)="startRoleEdit(r)"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate font-semibold">{{ r.name }}</span>
                  @if (r.is_template) {
                    <span class="badge badge-xs badge-outline">template</span>
                  }
                </div>
                <p class="type-caption mt-1">
                  {{ roleMemberCount(r.id) }} members · {{ r.permissions.length }} permissions
                </p>
              </div>
              <app-icon name="heroChevronRight" />
            </button>
          }
        </app-mobile-list>
        <div class="hidden gap-2 md:grid md:grid-cols-2">
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
                  <span class="type-caption mr-2">
                    {{ roleMemberCount(r.id) }} members · {{ r.permissions.length }} permissions
                  </span>
                  @for (perm of r.permissions; track perm) {
                    <span class="badge badge-xs badge-ghost">{{ permissionLabel(perm) }}</span>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }
      <app-delete-confirmation-modal
        [data]="removeData()"
        title="Remove team member?"
        entityType="member"
        verb="remove"
        confirmButtonText="Remove"
        (confirm)="confirmRemove()"
      />

      @if (selectedMember(); as member) {
        <app-drawer
          [open]="true"
          (closed)="selectedMemberId.set(null)"
          [title]="memberNameFor(member)"
          [subtitle]="'Joined ' + date(member.created_at)"
          mobileDismissLabel="Done"
        >
          <app-entity-avatar
            leading
            size="sm"
            [firstName]="memberNameFor(member)"
            [imageUrl]="memberAvatarUrl(member)"
          />
          <div class="flex flex-wrap items-center gap-2">
            @if (isSelf(member)) {
              <span class="badge badge-sm badge-outline">You</span>
            }
            @if (isPrimaryContact(member)) {
              <span class="badge badge-sm badge-primary">Primary contact</span>
            }
            <app-status-badge
              size="xs"
              [type]="memberStatusType(member.authorization_status)"
              [label]="member.authorization_status"
            />
          </div>

          <app-form-field label="Role" class="mt-4 block">
            <select
              class="select select-bordered w-full"
              [value]="member.role_id ?? ''"
              [disabled]="busy() || roles().length === 0 || isSelf(member)"
              [title]="isSelf(member) ? 'Ask another admin to change your role' : 'Change role'"
              (change)="changeRole(member, $any($event.target))"
            >
              @if (!member.role_id) {
                <option value="" disabled>No role</option>
              }
              @for (r of roles(); track r.id) {
                <option [value]="r.id" [selected]="r.id === member.role_id">{{ r.name }}</option>
              }
            </select>
          </app-form-field>

          <div class="mt-4 rounded-box border border-base-300 p-3">
            <p class="text-sm font-semibold">Locations</p>
            <p class="type-caption mt-1">
              {{ primaryLocationName(member) }}
              @if (additionalLocationCount(member) > 0) {
                · +{{ additionalLocationCount(member) }} more
              }
            </p>
            @if (locations().length > 1) {
              <button
                appButton
                variant="outline"
                class="mt-3 w-full"
                type="button"
                (click)="editMemberLocations(member)"
              >
                Manage locations
              </button>
            }
          </div>

          <div class="mt-4 grid gap-2">
            <button
              appButton
              variant="outline"
              type="button"
              [disabled]="busy()"
              (click)="renameMember(member)"
            >
              Rename member
            </button>
            @if (canBePrimaryContact(member) && !isPrimaryContact(member)) {
              <button
                appButton
                variant="outline"
                type="button"
                [disabled]="busy()"
                (click)="makePrimaryContact(member)"
              >
                Make primary contact
              </button>
            }
            @if (!isSelf(member)) {
              <button
                appButton
                variant="outline"
                type="button"
                [disabled]="
                  busy() || (member.authorization_status === 'disabled' && !canAddMember())
                "
                (click)="
                  setStatus(
                    member,
                    member.authorization_status === 'disabled' ? 'approved' : 'disabled'
                  )
                "
              >
                {{
                  member.authorization_status === 'disabled' ? 'Enable member' : 'Disable member'
                }}
              </button>
              <button
                appButton
                variant="error"
                type="button"
                [disabled]="busy()"
                (click)="selectedMemberId.set(null); startRemove(member)"
              >
                Remove member
              </button>
            } @else {
              <p class="type-caption text-center">
                Another admin must change your access or remove you.
              </p>
            }
          </div>
        </app-drawer>
      }

      @if (locationMember(); as member) {
        <app-drawer
          [open]="true"
          (closed)="locationMember.set(null)"
          [title]="'Locations for ' + memberNameFor(member)"
          subtitle="Choose where this person can work and set one primary location"
        >
          <div class="divide-y divide-base-200 rounded-box border border-base-300">
            @for (location of locations(); track location.id) {
              <div class="flex min-h-12 items-center gap-3 px-3">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  [checked]="selectedLocations().has(location.id)"
                  (change)="toggleMemberLocation(location.id)"
                />
                <span class="min-w-0 flex-1 text-sm font-medium">{{ location.name }}</span>
                <label class="label cursor-pointer gap-2">
                  <input
                    type="radio"
                    name="primary-location"
                    class="radio radio-sm"
                    [checked]="primaryLocationId() === location.id"
                    [disabled]="!selectedLocations().has(location.id)"
                    (change)="primaryLocationId.set(location.id)"
                  />
                  <span class="label-text text-xs">Primary</span>
                </label>
              </div>
            }
          </div>
          <div drawerFooter class="flex justify-end gap-2">
            <button appButton variant="ghost" type="button" (click)="locationMember.set(null)">
              Cancel
            </button>
            <button
              appButton
              type="button"
              [loading]="busy()"
              [disabled]="selectedLocations().size === 0 || !primaryLocationId()"
              (click)="saveMemberLocations()"
            >
              Save locations
            </button>
          </div>
        </app-drawer>
      }
    </app-page>
  `,
})
export class TeamComponent implements OnInit {
  private readonly team = inject(TeamService);
  private readonly supabase = inject(SupabaseService);
  private readonly profile = inject(ProfileService);
  private readonly permissions = inject(PermissionsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly entitlements = inject(EntitlementsService);
  protected readonly activeTab = signal<'members' | 'roles'>(
    this.route.snapshot.data['teamView'] === 'roles' ? 'roles' : 'members'
  );

  protected readonly currentUserId = computed(() => this.supabase.session()?.user.id ?? null);

  protected readonly allPermissions = ALL_PERMISSIONS;
  protected readonly permissionLabels = PERMISSION_LABELS;
  protected readonly permissionGroups = [
    {
      label: 'Sales',
      permissions: ['ManageApprovals', 'OverridePrice', 'ReverseOrder', 'SettleOrder'],
    },
    {
      label: 'Inventory',
      permissions: ['ManageCatalog', 'ManageStockAdjustments'],
    },
    {
      label: 'Customers / Suppliers',
      permissions: [
        'ApproveCustomerCredit',
        'ManageCustomerCreditLimit',
        'ManageCustomers',
        'OverrideCustomerBalance',
        'ManageSupplierCreditPurchases',
      ],
    },
    {
      label: 'Money',
      permissions: [
        'ViewFinancials',
        'ManageReconciliation',
        'CloseAccountingPeriod',
        'CreateInterAccountTransfer',
        'ManageCommissions',
      ],
    },
    {
      label: 'Administration',
      permissions: [
        'ManageCompanySettings',
        'ManageTeam',
        'ViewAuditTrail',
        'ViewStaffPerformance',
        'ManageCommunications',
      ],
    },
  ] as const;
  protected readonly members = this.team.members;
  protected readonly invitations = this.team.invitations;
  protected readonly roles = this.team.roles;
  protected readonly locations = this.team.locations;
  protected readonly membershipLocations = this.team.membershipLocations;
  protected readonly locationMember = signal<MembershipWithRole | null>(null);
  protected readonly selectedLocations = signal<Set<string>>(new Set());
  protected readonly primaryLocationId = signal<string | null>(null);
  protected readonly memberFormOpen = signal(false);
  protected readonly selectedMemberId = signal<string | null>(null);
  protected readonly selectedMember = computed(
    () => this.members().find(member => member.id === this.selectedMemberId()) ?? null
  );
  protected readonly memberMenuId = signal<string | null>(null);
  protected readonly memberMenuPosition = signal<{ top: number; left: number } | null>(null);
  protected readonly memberActionMenu = computed(() => {
    const member = this.members().find(item => item.id === this.memberMenuId());
    const position = this.memberMenuPosition();
    return member && position ? { member, ...position } : null;
  });
  protected readonly memberQuery = signal('');
  protected readonly memberSortOptions = MEMBER_SORT_OPTIONS;
  protected readonly memberSort = signal('name');
  protected readonly memberSortDirection = signal<ListSortDirection>('asc');
  protected readonly memberPage = signal(1);
  protected readonly memberPageSize = signal(10);
  protected readonly filteredMembers = computed(() => {
    const query = this.memberQuery().trim().toLowerCase();
    const rows = query
      ? this.members().filter(member =>
          [
            member.user_id,
            member.staff_profile?.display_name ?? '',
            member.roles?.name ?? '',
            member.authorization_status,
          ]
            .join(' ')
            .toLowerCase()
            .includes(query)
        )
      : this.members();
    const sortKey = this.memberSort();
    return sortList(
      rows,
      this.memberSortDirection(),
      member => {
        switch (sortKey) {
          case 'role':
            return member.roles?.name;
          case 'status':
            return member.authorization_status;
          case 'joined':
            return member.created_at;
          default:
            return this.memberNameFor(member);
        }
      },
      member => this.memberNameFor(member)
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
  protected readonly memberName = new FormControl('', { nonNullable: true });
  protected readonly memberRole = new FormControl('', { nonNullable: true });

  protected readonly roleFormOpen = signal(false);
  protected readonly editingRole = signal<Role | null>(null);
  protected readonly roleName = new FormControl('', { nonNullable: true });
  protected readonly rolePermissions = signal<Set<string>>(new Set());

  protected readonly busy = signal(false);
  protected readonly loading = this.team.loading;
  protected readonly error = this.team.error;
  protected readonly notice = signal<string | null>(null);
  protected readonly warning = signal<string | null>(null);
  private readonly resendClock = signal(Date.now());
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const timer = setInterval(() => this.resendClock.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
    effect(() => {
      const roles = this.roles();
      if (!this.memberRole.value && roles.length > 0) this.memberRole.setValue(roles[0].id);
    });
    effect(() => {
      if (this.permissions.ready() && !this.permissions.has('ManageTeam')) {
        void this.router.navigate(['/dashboard']);
      }
    });
  }

  protected permissionLabel(permission: string): string {
    return PERMISSION_LABELS[permission as keyof typeof PERMISSION_LABELS] ?? permission;
  }
  protected readonly memberLimit = computed(() => this.entitlements.limit('maxTeamMembers'));
  protected readonly activeMemberCount = computed(
    () => this.members().filter(member => member.authorization_status === 'approved').length
  );
  protected readonly activeInvitations = computed(() =>
    this.invitations().filter(invitation => !isInvitationExpired(invitation, this.resendClock()))
  );
  protected readonly expiredInvitations = computed(() =>
    this.invitations().filter(invitation => isInvitationExpired(invitation, this.resendClock()))
  );
  protected readonly displayedInvitations = computed(() => [
    ...this.activeInvitations(),
    ...this.expiredInvitations(),
  ]);
  protected readonly teamStats = computed(() => [
    {
      label: 'Members',
      value: this.members().length,
      mobilePriority: 'primary' as const,
    },
    {
      label: 'Active',
      value: this.activeMemberCount(),
      tone: 'success' as const,
      mobilePriority: 'primary' as const,
    },
    {
      label: 'Pending',
      value:
        this.members().filter(member => member.authorization_status === 'pending').length +
        this.activeInvitations().length,
      tone: 'warning' as const,
      mobilePriority: 'secondary' as const,
    },
    { label: 'Roles', value: this.roles().length, mobilePriority: 'secondary' as const },
  ]);
  protected readonly canAddMember = computed(() => {
    const limit = this.memberLimit();
    return limit === null || this.activeMemberCount() + this.activeInvitations().length < limit;
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.team.start();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load team');
    }
  }

  protected async load(): Promise<void> {
    try {
      await this.team.refresh(true);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load team');
    }
  }

  protected toggleMemberMenu(member: MembershipWithRole, event: MouseEvent): void {
    event.stopPropagation();
    if (this.memberMenuId() === member.id) {
      this.closeMemberMenu();
      return;
    }

    const trigger = event.currentTarget as HTMLElement;
    const triggerBox = trigger.getBoundingClientRect();
    const menuWidth = 224;
    const menuHeight = 238;
    const viewportEdge = 12;
    const menuGap = 6;
    const spaceBelow = window.innerHeight - triggerBox.bottom - viewportEdge;
    const spaceAbove = triggerBox.top - viewportEdge;
    const openAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const desiredTop = openAbove
      ? triggerBox.top - menuHeight - menuGap
      : triggerBox.bottom + menuGap;
    const maxTop = Math.max(viewportEdge, window.innerHeight - menuHeight - viewportEdge);
    const top = Math.min(Math.max(viewportEdge, desiredTop), maxTop);
    const maxLeft = Math.max(viewportEdge, window.innerWidth - menuWidth - viewportEdge);
    const left = Math.min(Math.max(viewportEdge, triggerBox.right - menuWidth), maxLeft);

    this.memberMenuPosition.set({ top, left });
    this.memberMenuId.set(member.id);
  }

  protected closeMemberMenu(): void {
    this.memberMenuId.set(null);
    this.memberMenuPosition.set(null);
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
    this.warning.set(null);
    try {
      const displayName = this.memberName.value.trim();
      if (!displayName) {
        this.error.set('Enter the team member name');
        return;
      }
      const result = await this.team.addTeamMember(phone, this.memberRole.value, displayName);
      if (result.status === 'updated') {
        this.notice.set(`Updated ${displayName}`);
      } else if (result.status === 'updated_invitation') {
        this.notice.set(`Updated ${displayName}'s pending invitation. No new message was sent.`);
      } else if (result.delivery_status === 'queued') {
        this.notice.set(`Invited ${displayName}. A WhatsApp message is queued for ${phone}.`);
      } else {
        this.warning.set(
          `Invited ${displayName}, but the message was not queued. ${invitationQueueFailureMessage(result.delivery_error)}`
        );
      }
      this.memberPhone.setValue('');
      this.memberName.setValue('');
      this.memberFormOpen.set(false);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Add failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancelInvitation(invitationId: string, displayName: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.warning.set(null);
    try {
      await this.team.cancelInvitation(invitationId);
      this.notice.set(`Cancelled the invitation for ${displayName}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async resendInvitation(invitation: TeamInvitation): Promise<void> {
    if (!this.canResend(invitation)) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.warning.set(null);
    try {
      const result = await this.team.resendInvitation(invitation.id);
      if (result.delivery_status === 'queued') {
        this.notice.set(
          this.invitationExpired(invitation)
            ? `Invitation renewed and resent to ${invitation.display_name}.`
            : `Invitation resent to ${invitation.display_name}.`
        );
      } else {
        this.warning.set(
          `The invitation was ${this.invitationExpired(invitation) ? 'renewed' : 'resent'}, but its message was not queued. ${invitationQueueFailureMessage(result.delivery_error)}`
        );
      }
      await this.load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resend failed';
      this.error.set(
        message.includes('invitation_resend_too_soon')
          ? 'Please wait five minutes before resending this invitation.'
          : message
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected canResend(invitation: TeamInvitation): boolean {
    return canResendInvitation(invitation, this.resendClock());
  }

  protected resendTitle(invitation: TeamInvitation): string {
    return invitationResendTitle(invitation, this.resendClock());
  }

  protected deliveryLabel(invitation: TeamInvitation): string {
    return invitationDeliveryLabel(invitation);
  }

  protected deliveryTone(invitation: TeamInvitation): 'success' | 'warning' | 'error' | 'neutral' {
    return invitationDeliveryTone(invitation);
  }

  protected deliveryHint(invitation: TeamInvitation): string {
    return invitationDeliveryHint(invitation);
  }

  protected invitationExpired(invitation: TeamInvitation): boolean {
    return isInvitationExpired(invitation, this.resendClock());
  }

  protected memberFormDirty(): boolean {
    return this.memberName.value.trim().length > 0 || this.memberPhone.value.trim().length > 0;
  }

  protected closeMemberForm(): void {
    if (this.memberFormDirty() && !window.confirm('Discard changes?')) return;
    this.resetMemberForm();
  }

  protected resetMemberForm(): void {
    this.memberFormOpen.set(false);
    this.memberName.setValue('');
    this.memberPhone.setValue('');
    this.memberRole.setValue(this.roles()[0]?.id ?? '');
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

  protected async changeRole(m: MembershipWithRole, select: HTMLSelectElement): Promise<void> {
    const roleId = select.value;
    if (!roleId || roleId === m.role_id) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.team.updateTeamMember(m.id, { role_id: roleId });
      const roleName = this.roles().find(r => r.id === roleId)?.name ?? 'role';
      this.notice.set(`${this.memberNameFor(m)} is now ${roleName}`);
      await this.load();
    } catch (err) {
      // The change didn't apply — snap the select back to the member's role.
      select.value = m.role_id ?? '';
      this.error.set(err instanceof Error ? err.message : 'Role change failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected isPrimaryContact(member: MembershipWithRole): boolean {
    return this.team.primaryContactUserId() === member.user_id;
  }

  protected canBePrimaryContact(member: MembershipWithRole): boolean {
    return (
      member.authorization_status === 'approved' &&
      (member.roles?.permissions.includes('ManageTeam') ?? false)
    );
  }

  protected async makePrimaryContact(member: MembershipWithRole): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.team.setPrimaryContact(member.user_id);
      this.notice.set(`${this.memberNameFor(member)} is now the primary contact`);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Primary contact update failed');
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
      entityName: m ? `${this.memberNameFor(m)} (${m.roles?.name ?? 'no role'})` : '',
    };
  }

  protected isSelf(member: MembershipWithRole): boolean {
    return member.user_id === this.currentUserId();
  }

  protected memberAvatarUrl(member: MembershipWithRole): string | null {
    return this.profile.avatarUrl(member.staff_profile?.avatar_path);
  }

  protected memberNameFor(member: MembershipWithRole): string {
    return member.staff_profile?.display_name ?? `User …${this.shortId(member.user_id)}`;
  }

  protected async renameMember(member: MembershipWithRole): Promise<void> {
    const next = window.prompt('Team member name', this.memberNameFor(member))?.trim();
    if (!next || next === this.memberNameFor(member)) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.team.updateStaffDisplayName(member.id, next);
      this.notice.set(`Renamed team member to ${next}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected editMemberLocations(member: MembershipWithRole): void {
    const assignments = this.membershipLocations().filter(item => item.membership_id === member.id);
    this.locationMember.set(member);
    this.selectedLocations.set(new Set(assignments.map(item => item.location_id)));
    this.primaryLocationId.set(
      assignments.find(item => item.is_primary)?.location_id ?? assignments[0]?.location_id ?? null
    );
    this.selectedMemberId.set(null);
  }

  protected primaryLocationName(member: MembershipWithRole): string {
    const assignments = this.membershipLocations().filter(item => item.membership_id === member.id);
    const primary = assignments.find(item => item.is_primary) ?? assignments[0];
    return (
      this.locations().find(location => location.id === primary?.location_id)?.name ??
      'All locations'
    );
  }

  protected additionalLocationCount(member: MembershipWithRole): number {
    return Math.max(
      0,
      this.membershipLocations().filter(item => item.membership_id === member.id).length - 1
    );
  }

  protected toggleMemberLocation(locationId: string): void {
    const next = new Set(this.selectedLocations());
    if (next.has(locationId)) {
      next.delete(locationId);
      if (this.primaryLocationId() === locationId) {
        this.primaryLocationId.set([...next][0] ?? null);
      }
    } else {
      next.add(locationId);
      if (!this.primaryLocationId()) this.primaryLocationId.set(locationId);
    }
    this.selectedLocations.set(next);
  }

  protected async saveMemberLocations(): Promise<void> {
    const member = this.locationMember();
    const primary = this.primaryLocationId();
    if (!member || !primary || this.selectedLocations().size === 0) return;
    this.busy.set(true);
    try {
      await this.team.setMembershipLocations(member.id, [...this.selectedLocations()], primary);
      this.notice.set('Member locations updated');
      this.locationMember.set(null);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Location update failed');
    } finally {
      this.busy.set(false);
    }
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

  protected roleFormDirty(): boolean {
    const editing = this.editingRole();
    const originalName = editing?.name ?? '';
    const original = new Set(editing?.permissions ?? []);
    const current = this.rolePermissions();
    return (
      this.roleName.value.trim() !== originalName ||
      original.size !== current.size ||
      [...original].some(permission => !current.has(permission))
    );
  }

  protected cancelRoleForm(): void {
    if (this.roleFormDirty() && !window.confirm('Discard changes?')) return;
    this.closeRoleForm();
  }

  protected roleMemberCount(roleId: string): number {
    return this.members().filter(member => member.role_id === roleId).length;
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
