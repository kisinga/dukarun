import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TeamService, type RoleTemplate } from '../../../../core/services/team.service';

/**
 * Multi-step modal for creating channel administrators
 *
 * Steps:
 * 1. Basic Info & Confirmation: Name, phone, email, and phone confirmation
 * 2. Role & Permissions: Role template selection + permissions display + confirm button
 */
@Component({
  selector: 'app-create-admin-modal',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-admin-modal.component.html',
  styleUrl: './create-admin-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateAdminModalComponent {
  private readonly teamService = inject(TeamService);
  private readonly fb = inject(FormBuilder);

  @Input() roleTemplates: RoleTemplate[] = [];
  @Output() memberCreated = new EventEmitter<void>();

  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  readonly step = signal(1);
  readonly error = signal<string | null>(null);
  readonly isSubmitting = signal(false);

  readonly form: FormGroup;

  // Super-admin permissions to filter out
  private readonly superAdminPermissions = new Set([
    'CreateChannel',
    'UpdateChannel',
    'DeleteChannel',
    'ReadChannel',
    'CreateRole',
    'UpdateRole',
    'DeleteRole',
    'ReadRole',
  ]);

  constructor() {
    this.form = this.fb.group({
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      phoneNumber: ['', [Validators.required]],
      phoneConfirm: ['', [Validators.required]],
      emailAddress: [''],
      roleTemplateCode: ['', [Validators.required]],
      permissionOverrides: [[]],
    });
  }

  open(): void {
    this.step.set(1);
    this.error.set(null);
    this.form.reset();
    const modal = this.modalRef()?.nativeElement;
    modal?.showModal();
  }

  close(): void {
    const modal = this.modalRef()?.nativeElement;
    modal?.close();
  }

  nextStep(): void {
    if (this.step() === 1) {
      // Validate step 1 fields
      const firstName = this.form.get('firstName');
      const lastName = this.form.get('lastName');
      const phoneNumber = this.form.get('phoneNumber');
      const phoneConfirm = this.form.get('phoneConfirm');

      if (!firstName?.valid || !lastName?.valid || !phoneNumber?.valid || !phoneConfirm?.valid) {
        firstName?.markAsTouched();
        lastName?.markAsTouched();
        phoneNumber?.markAsTouched();
        phoneConfirm?.markAsTouched();
        return;
      }

      // Validate phone numbers match
      if (phoneNumber.value !== phoneConfirm.value) {
        this.error.set('Phone numbers do not match');
        return;
      }

      this.error.set(null);
      this.step.set(2);
      return;
    }
  }

  prevStep(): void {
    if (this.step() > 1) {
      this.step.set(this.step() - 1);
      this.error.set(null);
    }
  }

  getSelectedTemplate(): RoleTemplate | undefined {
    const code = this.form.get('roleTemplateCode')?.value;
    return this.roleTemplates.find((t) => t.code === code);
  }

  /**
   * Filter out super-admin permissions from a list
   */
  private filterSuperAdminPermissions(permissions: string[]): string[] {
    return permissions.filter((perm) => {
      // Check if permission contains any super-admin permission string
      return !Array.from(this.superAdminPermissions).some((superPerm) => perm.includes(superPerm));
    });
  }

  /**
   * Group permissions by category
   */
  private groupPermissions(permissions: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {
      Assets: [],
      Catalog: [],
      Customers: [],
      Orders: [],
      Products: [],
      Stock: [],
      Administration: [],
      Settings: [],
      Custom: [],
    };

    permissions.forEach((perm) => {
      const permUpper = perm.toUpperCase();

      if (permUpper.includes('ASSET')) {
        groups.Assets.push(perm);
      } else if (permUpper.includes('CATALOG')) {
        groups.Catalog.push(perm);
      } else if (permUpper.includes('CUSTOMER')) {
        groups.Customers.push(perm);
      } else if (permUpper.includes('ORDER')) {
        groups.Orders.push(perm);
      } else if (permUpper.includes('PRODUCT')) {
        groups.Products.push(perm);
      } else if (permUpper.includes('STOCKLOCATION') || permUpper.includes('STOCK')) {
        groups.Stock.push(perm);
      } else if (permUpper.includes('ADMINISTRATOR') || permUpper.includes('ADMIN')) {
        groups.Administration.push(perm);
      } else if (permUpper.includes('SETTINGS') || permUpper.includes('SETTING')) {
        groups.Settings.push(perm);
      } else {
        // Custom permissions (OverridePrice, ApproveCustomerCredit, etc.)
        groups.Custom.push(perm);
      }
    });

    // Remove empty groups
    Object.keys(groups).forEach((key) => {
      if (groups[key].length === 0) {
        delete groups[key];
      }
    });

    return groups;
  }

  /**
   * Get filtered and grouped permissions from selected template
   */
  readonly groupedPermissions = computed(() => {
    const template = this.getSelectedTemplate();
    if (!template) {
      return {};
    }

    const filtered = this.filterSuperAdminPermissions(template.permissions);
    return this.groupPermissions(filtered);
  });

  /**
   * Get all filtered permissions from selected template
   */
  readonly filteredPermissions = computed(() => {
    const template = this.getSelectedTemplate();
    if (!template) {
      return [];
    }
    return this.filterSuperAdminPermissions(template.permissions);
  });

  /**
   * Check if step 1 is valid
   */
  readonly isStep1Valid = computed(() => {
    const firstName = this.form.get('firstName');
    const lastName = this.form.get('lastName');
    const phoneNumber = this.form.get('phoneNumber');
    const phoneConfirm = this.form.get('phoneConfirm');

    return (
      firstName?.valid &&
      lastName?.valid &&
      phoneNumber?.valid &&
      phoneConfirm?.valid &&
      phoneNumber?.value === phoneConfirm?.value
    );
  });

  /**
   * Check if step 2 is valid
   */
  readonly isStep2Valid = computed(() => {
    return this.form.get('roleTemplateCode')?.valid && !!this.getSelectedTemplate();
  });

  async submit(): Promise<void> {
    // Validate all required fields
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Ensure we're on step 2
    if (this.step() !== 2) {
      return;
    }

    // Validate role template is selected
    if (!this.form.get('roleTemplateCode')?.value) {
      this.form.get('roleTemplateCode')?.markAsTouched();
      this.error.set('Please select a role template');
      return;
    }

    const phoneNumber = this.form.get('phoneNumber')?.value;
    const phoneConfirm = this.form.get('phoneConfirm')?.value;

    if (phoneNumber !== phoneConfirm) {
      this.error.set('Phone numbers do not match');
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      const formValue = this.form.value;
      await this.teamService.createMember({
        firstName: formValue.firstName,
        lastName: formValue.lastName,
        phoneNumber: formValue.phoneNumber,
        emailAddress: formValue.emailAddress || undefined,
        roleTemplateCode: formValue.roleTemplateCode,
        permissionOverrides:
          formValue.permissionOverrides?.length > 0 ? formValue.permissionOverrides : undefined,
      });

      this.memberCreated.emit();
      this.close();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to create team member');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Format permission name for display
   */
  formatPermissionName(permission: string): string {
    // Handle custom permissions (e.g., "OverridePricePermission")
    if (permission.includes('Permission')) {
      return permission
        .replace(/Permission$/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim();
    }

    // Handle standard permissions (e.g., "CreateAsset", "ReadCustomer")
    const action = permission.match(/^(Create|Read|Update|Delete)/)?.[0] || '';
    const resource = permission.replace(/^(Create|Read|Update|Delete)/, '');

    if (action && resource) {
      return `${action} ${resource.replace(/([A-Z])/g, ' $1').trim()}`;
    }

    // Fallback: just add spaces before capitals
    return permission.replace(/([A-Z])/g, ' $1').trim();
  }

  // Expose Object for template use
  readonly Object = Object;

  onBackdropClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'DIALOG') {
      this.close();
    }
  }
}
