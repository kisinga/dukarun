import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { UPDATE_ADMINISTRATOR } from '../../../core/graphql/operations.graphql';
import { ApolloService } from '../../../core/services/apollo.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-profile',
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="max-w-3xl mx-auto space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Profile Settings</h1>
          <p class="text-sm text-base-content/60 mt-1">
            Update your personal information and security settings
          </p>
        </div>
      </div>

      <!-- Main Card -->
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-0">
          <form [formGroup]="profileForm" (ngSubmit)="onSubmit()" class="divide-y divide-base-300">
            <!-- Personal Information Section -->
            <div class="p-6 space-y-4">
              <h2 class="text-lg font-semibold flex items-center gap-2">
                <span
                  class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </span>
                Personal Information
              </h2>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="form-control">
                  <label class="label">
                    <span class="label-text font-medium">First Name</span>
                  </label>
                  <input
                    type="text"
                    formControlName="firstName"
                    class="input input-bordered w-full focus:input-primary"
                    [class.input-error]="isFieldInvalid('firstName')"
                    placeholder="Enter first name"
                  />
                  @if (isFieldInvalid('firstName')) {
                    <label class="label">
                      <span class="label-text-alt text-error">First name is required</span>
                    </label>
                  }
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text font-medium">Last Name</span>
                  </label>
                  <input
                    type="text"
                    formControlName="lastName"
                    class="input input-bordered w-full focus:input-primary"
                    [class.input-error]="isFieldInvalid('lastName')"
                    placeholder="Enter last name"
                  />
                  @if (isFieldInvalid('lastName')) {
                    <label class="label">
                      <span class="label-text-alt text-error">Last name is required</span>
                    </label>
                  }
                </div>

                <div class="form-control md:col-span-2">
                  <label class="label">
                    <span class="label-text font-medium">Email Address</span>
                  </label>
                  <input
                    type="email"
                    formControlName="emailAddress"
                    class="input input-bordered w-full focus:input-primary"
                    [class.input-error]="isFieldInvalid('emailAddress')"
                    placeholder="Enter email address"
                  />
                  @if (isFieldInvalid('emailAddress')) {
                    <label class="label">
                      <span class="label-text-alt text-error">Valid email is required</span>
                    </label>
                  }
                </div>
              </div>
            </div>

            <!-- Security Section -->
            <div class="p-6 space-y-4">
              <h2 class="text-lg font-semibold flex items-center gap-2">
                <span
                  class="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </span>
                Security
              </h2>

              <div class="alert alert-info bg-info/10 text-xs py-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  class="stroke-current shrink-0 w-5 h-5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  ></path>
                </svg>
                Leave password fields blank if you don't want to change your password.
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="form-control">
                  <label class="label">
                    <span class="label-text font-medium">New Password</span>
                  </label>
                  <input
                    type="password"
                    formControlName="password"
                    class="input input-bordered w-full focus:input-primary"
                    [class.input-error]="
                      profileForm.errors?.['passwordMismatch'] &&
                      profileForm.get('password')?.touched
                    "
                    placeholder="Min. 8 characters"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text font-medium">Confirm New Password</span>
                  </label>
                  <input
                    type="password"
                    formControlName="confirmPassword"
                    class="input input-bordered w-full focus:input-primary"
                    [class.input-error]="
                      profileForm.errors?.['passwordMismatch'] &&
                      profileForm.get('confirmPassword')?.touched
                    "
                    placeholder="Retype password"
                  />
                </div>
              </div>
              @if (
                profileForm.errors?.['passwordMismatch'] &&
                (profileForm.get('password')?.touched ||
                  profileForm.get('confirmPassword')?.touched)
              ) {
                <div class="text-error text-sm mt-1">Passwords do not match</div>
              }
            </div>

            <!-- Action Buttons -->
            <div class="p-6 bg-base-50/50 flex items-center justify-end gap-3 rounded-b-xl">
              <button
                type="button"
                class="btn btn-ghost"
                (click)="resetForm()"
                [disabled]="isSaving()"
              >
                Reset
              </button>
              <button
                type="submit"
                class="btn btn-primary min-w-[120px]"
                [disabled]="profileForm.invalid || isSaving()"
              >
                @if (isSaving()) {
                  <span class="loading loading-spinner loading-sm"></span>
                  Saving...
                } @else {
                  Save Changes
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly apolloService = inject(ApolloService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  isSaving = signal(false);

  profileForm = this.fb.group(
    {
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      emailAddress: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.minLength(8)]],
      confirmPassword: [''],
    },
    { validators: this.passwordMatchValidator },
  );

  constructor() {
    this.initializeForm();
  }

  private initializeForm(): void {
    const user = this.authService.user();
    if (user) {
      this.profileForm.patchValue({
        firstName: user.firstName,
        lastName: user.lastName,
        emailAddress: user.emailAddress,
      });
    }
  }

  resetForm(): void {
    this.initializeForm();
    this.profileForm.get('password')?.reset();
    this.profileForm.get('confirmPassword')?.reset();
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.profileForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  passwordMatchValidator(g: any) {
    return g.get('password').value === g.get('confirmPassword').value
      ? null
      : { passwordMismatch: true };
  }

  async onSubmit(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const formValue = this.profileForm.value;

    // Prepare input - only include password if it was provided
    const input: any = {
      firstName: formValue.firstName,
      lastName: formValue.lastName,
      emailAddress: formValue.emailAddress,
    };

    if (formValue.password) {
      input.password = formValue.password;
    }

    try {
      const client = this.apolloService.getClient();
      await client.mutate({
        mutation: UPDATE_ADMINISTRATOR,
        variables: { input },
      });

      this.toastService.show('Success', 'Profile updated successfully', 'success');

      // If password changed, maybe prompt re-login or just proceed?
      // For now we just stay on page. The backend session might invalidate if password changes depending on security policy,
      // but usually for simple updates it stays active.

      // Refresh user data (if needed, though standard Apollo cache might handle it if ID matches)
      // The auth service init fetches active admin which updates the signal
      await this.authService.waitForInitialization(); // Re-fetch or just let cache handle it

      this.profileForm.get('password')?.reset();
      this.profileForm.get('confirmPassword')?.reset();
    } catch (error) {
      console.error('Failed to update profile:', error);
      this.toastService.show('Error', 'Failed to update profile. Please try again.', 'error');
    } finally {
      this.isSaving.set(false);
    }
  }
}
