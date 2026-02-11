import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  TeamService,
  type Administrator,
  type RoleTemplate,
} from '../../../core/services/team.service';
import { CreateAdminModalComponent } from './components/create-admin-modal.component';
import { PermissionEditorComponent } from './components/permission-editor.component';
import { TeamMemberRowComponent } from './components/team-member-row.component';

/**
 * Team management page
 *
 * Displays list of channel administrators with ability to:
 * - View team members
 * - Create new admins with role templates
 * - Update permissions
 * - Disable admins
 */
@Component({
  selector: 'app-team',
  imports: [
    CommonModule,
    TeamMemberRowComponent,
    CreateAdminModalComponent,
    PermissionEditorComponent,
  ],
  templateUrl: './team.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamComponent implements OnInit {
  private readonly teamService = inject(TeamService);

  // View references
  readonly createModal = viewChild<CreateAdminModalComponent>('createModal');
  readonly permissionEditor = viewChild<PermissionEditorComponent>('permissionEditor');

  // State from service
  readonly members = this.teamService.members;
  readonly roleTemplates = this.teamService.roleTemplates;
  readonly isLoading = this.teamService.isLoading;
  readonly error = this.teamService.error;

  // Local UI state
  readonly searchQuery = signal('');
  readonly memberToEdit = signal<Administrator | null>(null);
  readonly memberToDelete = signal<Administrator | null>(null);

  // Computed: filtered members
  readonly filteredMembers = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const allMembers = this.members();

    if (!query) return allMembers;

    return allMembers.filter(
      (member) =>
        member.firstName?.toLowerCase().includes(query) ||
        member.lastName?.toLowerCase().includes(query) ||
        member.emailAddress?.toLowerCase().includes(query) ||
        member.user?.identifier?.toLowerCase().includes(query),
    );
  });

  // Computed: stats
  readonly stats = computed(() => {
    const allMembers = this.members();
    return {
      total: allMembers.length,
      verified: allMembers.filter((m) => m.user?.verified).length,
      byRole: allMembers.reduce(
        (acc, member) => {
          const roleCode = member.user?.roles?.[0]?.code ?? 'unknown';
          acc[roleCode] = (acc[roleCode] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  });

  // Expose Object for template use
  readonly Object = Object;

  async ngOnInit(): Promise<void> {
    await Promise.all([this.teamService.loadRoleTemplates(), this.teamService.loadMembers()]);
  }

  onSearch(query: string): void {
    this.searchQuery.set(query);
  }

  onCreateClick(): void {
    this.createModal()?.open();
  }

  onEditClick(member: Administrator): void {
    this.memberToEdit.set(member);
    this.permissionEditor()?.open(member);
  }

  async onDeleteClick(member: Administrator): Promise<void> {
    if (!confirm(`Are you sure you want to remove ${member.firstName} ${member.lastName}?`)) {
      return;
    }

    const success = await this.teamService.deleteMember(member.id);
    if (success) {
      this.memberToDelete.set(null);
    }
  }

  async onMemberCreated(): Promise<void> {
    await this.teamService.loadMembers();
  }

  async onPermissionsUpdated(): Promise<void> {
    await this.teamService.loadMembers();
    this.memberToEdit.set(null);
  }
}
