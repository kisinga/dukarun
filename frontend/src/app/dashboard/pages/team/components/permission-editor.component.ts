import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  signal,
  viewChild,
} from '@angular/core';
import {
  TeamService,
  type Administrator,
  type RoleTemplate,
} from '../../../../core/services/team.service';
import {
  filterSuperAdminPermissions,
  formatPermissionName,
  groupPermissions,
} from '../utils/permission-grouping';

/**
 * Permission Editor Component
 *
 * Allows editing permissions for a team member with grouped toggles.
 * Shows all assignable permissions (union of member's current + all role templates), filtered and grouped.
 */
@Component({
  selector: 'app-permission-editor',
  imports: [CommonModule],
  templateUrl: './permission-editor.component.html',
  styleUrl: './permission-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PermissionEditorComponent {
  private readonly teamService = inject(TeamService);

  @Input() member: Administrator | null = null;
  @Input() roleTemplates: RoleTemplate[] = [];
  @Output() permissionsUpdated = new EventEmitter<void>();

  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');
  readonly selectedPermissions = signal<Set<string>>(new Set());
  readonly selectedTemplateCode = signal<string>('');
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  open(member: Administrator | null): void {
    if (!member) return;

    this.member = member;
    const permissions = member.user?.roles?.[0]?.permissions ?? [];
    this.selectedPermissions.set(new Set(permissions));
    this.selectedTemplateCode.set('');
    this.error.set(null);

    const modal = this.modalRef()?.nativeElement;
    modal?.showModal();
  }

  close(): void {
    const modal = this.modalRef()?.nativeElement;
    modal?.close();
  }

  togglePermission(permission: string): void {
    const current = new Set(this.selectedPermissions());
    if (current.has(permission)) {
      current.delete(permission);
    } else {
      current.add(permission);
    }
    this.selectedPermissions.set(current);
  }

  hasPermission(permission: string): boolean {
    return this.selectedPermissions().has(permission);
  }

  /**
   * All permissions to display: union of member's current permissions and all role template permissions,
   * with super-admin-only permissions filtered out.
   */
  getAllDisplayedPermissions(): string[] {
    const memberPerms = this.member?.user?.roles?.[0]?.permissions ?? [];
    const templatePerms = this.roleTemplates.flatMap((t) => t.permissions);
    const union = Array.from(new Set([...memberPerms, ...templatePerms]));
    return filterSuperAdminPermissions(union);
  }

  /**
   * Grouped permissions for expansion panels (same categories as create-admin).
   */
  getGroupedDisplayedPermissions(): Record<string, string[]> {
    return groupPermissions(this.getAllDisplayedPermissions());
  }

  applyTemplate(): void {
    const code = this.selectedTemplateCode();
    const template = this.roleTemplates.find((t) => t.code === code);
    if (!template) return;
    const filtered = filterSuperAdminPermissions(template.permissions);
    this.selectedPermissions.set(new Set(filtered));
  }

  /**
   * Called when the template dropdown selection changes. Updates the selected template code
   * and immediately applies that template's permissions (auto-update).
   */
  onTemplateChange(code: string): void {
    this.selectedTemplateCode.set(code);
    if (code) {
      this.applyTemplate();
    }
  }

  formatPermissionName = formatPermissionName;

  async save(): Promise<void> {
    if (!this.member) return;

    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      const permissions = Array.from(this.selectedPermissions());
      await this.teamService.updateMember(this.member.id, permissions);
      this.permissionsUpdated.emit();
      this.close();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to update permissions');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onBackdropClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'DIALOG') {
      this.close();
    }
  }

  readonly Object = Object;
}
