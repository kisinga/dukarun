import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnInit,
  OnDestroy,
  Output,
  signal,
  viewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
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
export class CreateAdminModalComponent implements OnInit, OnDestroy {
  private readonly teamService = inject(TeamService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() roleTemplates: RoleTemplate[] = [];
  @Output() memberCreated = new EventEmitter<void>();

  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  readonly step = signal(1);
  readonly error = signal<string | null>(null);
  readonly isSubmitting = signal(false);

  readonly form: FormGroup;

  // Reactive validity signals
  readonly isStep1Valid = signal(false);
  readonly isStep2Valid = signal(false);

  // Track selected permissions (Set for O(1) lookup)
  readonly selectedPermissions = signal<Set<string>>(new Set());

  private formSubscriptions = new Subscription();

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

  ngOnInit(): void {
    // Subscribe to form value changes to update validity signals
    this.formSubscriptions.add(
      this.form.valueChanges.subscribe(() => {
        this.updateStepValidity();
      }),
    );

    this.formSubscriptions.add(
      this.form.statusChanges.subscribe(() => {
        this.updateStepValidity();
      }),
    );

    // Watch for role template code changes to initialize permissions
    this.formSubscriptions.add(
      this.form.get('roleTemplateCode')?.valueChanges.subscribe(() => {
        this.onTemplateSelected();
      }) || new Subscription(),
    );

    // Initial validation check
    this.updateStepValidity();
  }

  ngOnDestroy(): void {
    this.formSubscriptions.unsubscribe();
  }

  private updateStepValidity(): void {
    const firstName = this.form.get('firstName');
    const lastName = this.form.get('lastName');
    const phoneNumber = this.form.get('phoneNumber');
    const phoneConfirm = this.form.get('phoneConfirm');

    const step1Valid =
      !!(firstName?.valid && lastName?.valid && phoneNumber?.valid && phoneConfirm?.valid) &&
      phoneNumber?.value === phoneConfirm?.value;

    this.isStep1Valid.set(step1Valid);

    const roleTemplateCode = this.form.get('roleTemplateCode');
    const step2Valid = !!roleTemplateCode?.valid && !!this.getSelectedTemplate();
    this.isStep2Valid.set(step2Valid);

    // Manually trigger change detection for OnPush strategy
    this.cdr.markForCheck();
  }

  open(): void {
    this.step.set(1);
    this.error.set(null);
    this.form.reset();
    this.isStep1Valid.set(false);
    this.isStep2Valid.set(false);
    this.selectedPermissions.set(new Set());
    const modal = this.modalRef()?.nativeElement;
    modal?.showModal();
    // Trigger validation after a brief delay to ensure form is reset
    setTimeout(() => this.updateStepValidity(), 0);
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
   * Initialize selected permissions from template when template is selected
   */
  onTemplateSelected(): void {
    const template = this.getSelectedTemplate();
    if (template) {
      const filtered = this.filterSuperAdminPermissions(template.permissions);
      this.selectedPermissions.set(new Set(filtered));
      this.updatePermissionOverrides();
    } else {
      this.selectedPermissions.set(new Set());
      this.updatePermissionOverrides();
    }
    this.updateStepValidity();
  }

  /**
   * Toggle a permission's selection state
   */
  togglePermission(permission: string): void {
    const current = this.selectedPermissions();
    const newSet = new Set(current);

    if (newSet.has(permission)) {
      newSet.delete(permission);
    } else {
      newSet.add(permission);
    }

    this.selectedPermissions.set(newSet);
    this.updatePermissionOverrides();
  }

  /**
   * Check if a permission is selected
   */
  isPermissionSelected(permission: string): boolean {
    return this.selectedPermissions().has(permission);
  }

  /**
   * Update form's permissionOverrides with selected permissions
   */
  private updatePermissionOverrides(): void {
    const selected = Array.from(this.selectedPermissions());
    this.form.patchValue({ permissionOverrides: selected }, { emitEvent: false });
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
        groups['Assets'].push(perm);
      } else if (permUpper.includes('CATALOG')) {
        groups['Catalog'].push(perm);
      } else if (permUpper.includes('CUSTOMER')) {
        groups['Customers'].push(perm);
      } else if (permUpper.includes('ORDER')) {
        groups['Orders'].push(perm);
      } else if (permUpper.includes('PRODUCT')) {
        groups['Products'].push(perm);
      } else if (permUpper.includes('STOCKLOCATION') || permUpper.includes('STOCK')) {
        groups['Stock'].push(perm);
      } else if (permUpper.includes('ADMINISTRATOR') || permUpper.includes('ADMIN')) {
        groups['Administration'].push(perm);
      } else if (permUpper.includes('SETTINGS') || permUpper.includes('SETTING')) {
        groups['Settings'].push(perm);
      } else {
        // Custom permissions (OverridePrice, ApproveCustomerCredit, etc.)
        groups['Custom'].push(perm);
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

      // Fix email address: convert empty string to undefined and exclude from input if undefined
      const emailAddress = formValue.emailAddress?.trim();
      const hasEmail = emailAddress && emailAddress.length > 0;

      // Get selected permissions
      const selectedPerms = Array.from(this.selectedPermissions());
      const permissionOverrides = selectedPerms.length > 0 ? selectedPerms : undefined;

      // Build input object, conditionally including emailAddress
      const input: any = {
        firstName: formValue.firstName,
        lastName: formValue.lastName,
        phoneNumber: formValue.phoneNumber,
        roleTemplateCode: formValue.roleTemplateCode,
      };

      // Only include emailAddress if it has a value
      if (hasEmail) {
        input.emailAddress = emailAddress;
      }

      // Only include permissionOverrides if there are any
      if (permissionOverrides) {
        input.permissionOverrides = permissionOverrides;
      }

      await this.teamService.createMember(input);

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
