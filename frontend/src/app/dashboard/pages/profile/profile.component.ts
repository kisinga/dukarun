import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import { UPDATE_ADMIN_PROFILE } from '../../../core/graphql/operations.graphql';
import { ApolloService } from '../../../core/services/apollo.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

// GraphQL query for checking identifier availability
const CHECK_IDENTIFIER_AVAILABLE = `
  query CheckIdentifierAvailable($identifier: String!) {
    checkIdentifierAvailable(identifier: $identifier)
  }
`;

@Component({
  selector: 'app-profile',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-3xl mx-auto space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <h1 class="text-2xl sm:text-2xl lg:text-3xl font-bold tracking-tight">
            Profile Settings
          </h1>
          <p class="text-xs sm:text-sm text-base-content/60 font-medium">
            Update your personal information
          </p>
        </div>
      </div>

      <!-- Main Card -->
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body space-y-6">
          <!-- Profile Picture Section -->
          <div class="space-y-4">
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
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </span>
              Profile Picture
            </h2>

            <div class="flex items-center gap-4">
              @if (photoPreview()) {
                <!-- New photo preview -->
                <div class="avatar">
                  <div
                    class="w-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2"
                  >
                    <img [src]="photoPreview()" alt="New Profile Preview" />
                  </div>
                </div>
                <div class="flex flex-col gap-2">
                  <span class="text-sm text-primary font-medium">New photo selected</span>
                  <button type="button" class="btn btn-xs btn-error" (click)="removePhoto()">
                    Remove
                  </button>
                </div>
              } @else if (currentPhotoUrl()) {
                <!-- Existing photo -->
                <div class="avatar">
                  <div
                    class="w-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2"
                  >
                    <img [src]="currentPhotoUrl()" alt="Current Profile Picture" />
                  </div>
                </div>
                <div class="flex flex-col gap-2">
                  <span class="text-sm text-success">Current photo</span>
                  <div class="flex gap-1">
                    <button type="button" class="btn btn-xs btn-outline" (click)="selectPhoto()">
                      Change
                    </button>
                    <button type="button" class="btn btn-xs btn-error" (click)="removePhoto()">
                      Remove
                    </button>
                  </div>
                </div>
              } @else {
                <!-- No photo - show initials -->
                <div class="avatar placeholder">
                  <div
                    class="bg-neutral text-neutral-content rounded-full w-24 ring ring-primary ring-offset-base-100 ring-offset-2"
                  >
                    <span class="text-3xl font-bold">{{ getInitials() }}</span>
                  </div>
                </div>
                <div class="flex flex-col gap-2">
                  <span class="text-sm text-base-content/60">No photo set</span>
                  <button type="button" class="btn btn-xs btn-primary" (click)="selectPhoto()">
                    Add Photo
                  </button>
                </div>
              }
            </div>
          </div>

          <div class="divider"></div>

          <!-- Personal Information -->
          <div class="space-y-4">
            <h2 class="text-lg font-semibold">Personal Information</h2>

            <!-- First Name -->
            <div class="form-control">
              <label class="label">
                <span class="label-text">First Name <span class="text-error">*</span></span>
              </label>
              <input
                type="text"
                class="input input-bordered w-full"
                [(ngModel)]="firstName"
                placeholder="Enter first name"
                [disabled]="isSaving()"
              />
            </div>

            <!-- Last Name -->
            <div class="form-control">
              <label class="label">
                <span class="label-text">Last Name <span class="text-error">*</span></span>
              </label>
              <input
                type="text"
                class="input input-bordered w-full"
                [(ngModel)]="lastName"
                placeholder="Enter last name"
                [disabled]="isSaving()"
              />
            </div>

            <!-- Email with availability check -->
            <div class="form-control">
              <label class="label">
                <span class="label-text">Email Address <span class="text-error">*</span></span>
              </label>
              <label
                class="input input-bordered w-full flex items-center gap-2"
                [class.input-success]="emailStatus() === 'available'"
                [class.input-error]="emailStatus() === 'taken'"
              >
                <input
                  type="email"
                  class="grow"
                  [(ngModel)]="email"
                  (blur)="onEmailBlur()"
                  (input)="onEmailInput()"
                  placeholder="your@email.com"
                  [disabled]="isSaving()"
                />
                @switch (emailStatus()) {
                  @case ('checking') {
                    <span class="loading loading-spinner loading-sm text-base-content/50"></span>
                  }
                  @case ('available') {
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="size-5 text-success"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  }
                  @case ('taken') {
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="size-5 text-error"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  }
                }
              </label>
              @if (emailStatus() === 'available') {
                <label class="label py-1">
                  <span class="label-text-alt text-success">✓ Email is available</span>
                </label>
              } @else if (emailStatus() === 'taken') {
                <label class="label py-1">
                  <span class="label-text-alt text-error"
                    >This email is already used by another account</span
                  >
                </label>
              }
            </div>

            <!-- Phone Number (readonly - for display) -->
            <div class="form-control">
              <label class="label">
                <span class="label-text">Phone Number</span>
              </label>
              <input
                type="tel"
                class="input input-bordered w-full"
                [value]="phoneNumber"
                disabled
              />
              <label class="label">
                <span class="label-text-alt text-base-content/60">
                  Phone number is used for login and cannot be changed here
                </span>
              </label>
            </div>
          </div>

          <!-- Save Button -->
          <div class="flex justify-end gap-3 pt-4 border-t border-base-300">
            <button
              type="button"
              class="btn btn-ghost"
              (click)="resetForm()"
              [disabled]="isSaving()"
            >
              Reset
            </button>
            <button
              type="button"
              class="btn btn-primary min-w-[120px]"
              (click)="saveProfile()"
              [disabled]="!canSave()"
            >
              @if (isSaving()) {
                <span class="loading loading-spinner loading-sm"></span>
                Saving...
              } @else {
                Save Changes
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  private readonly authService = inject(AuthService);
  private readonly apolloService = inject(ApolloService);
  private readonly toastService = inject(ToastService);

  // Form fields (ngModel bound)
  firstName = '';
  lastName = '';
  email = '';
  phoneNumber = '';

  // Original values (for change detection)
  private originalFirstName = '';
  private originalLastName = '';
  private originalEmail = '';
  private originalPhotoId: string | null = null;

  // Photo state
  readonly photoPreview = signal<string | null>(null);
  readonly currentPhotoUrl = signal<string | null>(null);
  private selectedFile: File | null = null;
  private photoMarkedForRemoval = false;

  // Email validation status
  readonly emailStatus = signal<'idle' | 'checking' | 'available' | 'taken'>('idle');
  private lastCheckedEmail = '';

  // Loading state
  readonly isSaving = signal(false);

  constructor() {
    this.loadUserData();
  }

  private loadUserData(): void {
    const user = this.authService.user();
    if (user) {
      this.firstName = user.firstName || '';
      this.lastName = user.lastName || '';
      this.email = user.emailAddress || '';
      this.phoneNumber = user.user?.identifier || '';

      // Store original values
      this.originalFirstName = this.firstName;
      this.originalLastName = this.lastName;
      this.originalEmail = this.email;
      this.lastCheckedEmail = this.email;

      // Load profile picture
      const customFields = (user as any).customFields;
      if (customFields?.profilePicture) {
        const pic = customFields.profilePicture;
        this.currentPhotoUrl.set(pic.preview || pic.source);
        this.originalPhotoId = pic.id;
      }
    }
  }

  getInitials(): string {
    return `${this.firstName.charAt(0)}${this.lastName.charAt(0)}`.toUpperCase();
  }

  // === Email validation (like signup pattern) ===

  async onEmailBlur(): Promise<void> {
    const trimmedEmail = this.email.trim();

    // Skip if empty, same as original, or same as last check
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      return;
    }

    if (trimmedEmail === this.originalEmail) {
      this.emailStatus.set('idle');
      return;
    }

    if (trimmedEmail === this.lastCheckedEmail && this.emailStatus() !== 'idle') {
      return;
    }

    this.emailStatus.set('checking');
    this.lastCheckedEmail = trimmedEmail;

    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: { kind: 'Document', definitions: [] } as any, // Placeholder - actual query below
        fetchPolicy: 'network-only',
      });

      // Use raw fetch for the query since we don't have generated types
      const response = await fetch(environment.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apolloService.getChannelToken()
            ? { 'vendure-token': this.apolloService.getChannelToken()! }
            : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          query: CHECK_IDENTIFIER_AVAILABLE,
          variables: { identifier: trimmedEmail },
        }),
      });

      const data = await response.json();
      const isAvailable = data.data?.checkIdentifierAvailable ?? false;
      this.emailStatus.set(isAvailable ? 'available' : 'taken');
    } catch (error) {
      console.error('Failed to check email availability:', error);
      this.emailStatus.set('idle');
    }
  }

  onEmailInput(): void {
    // Reset status when user types
    if (this.emailStatus() !== 'idle' && this.email.trim() !== this.lastCheckedEmail) {
      this.emailStatus.set('idle');
    }
  }

  // === Photo handling ===

  selectPhoto(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';

    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        this.toastService.show('Error', 'File size must be less than 5MB', 'error');
        return;
      }

      this.selectedFile = file;
      this.photoMarkedForRemoval = false;

      // Generate preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.photoPreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    };

    input.click();
  }

  removePhoto(): void {
    this.selectedFile = null;
    this.photoPreview.set(null);
    this.currentPhotoUrl.set(null);
    this.photoMarkedForRemoval = true;
  }

  // === Form logic ===

  hasChanges(): boolean {
    const nameChanged =
      this.firstName !== this.originalFirstName || this.lastName !== this.originalLastName;
    const emailChanged = this.email.trim() !== this.originalEmail;
    const photoChanged = this.selectedFile !== null || this.photoMarkedForRemoval;
    return nameChanged || emailChanged || photoChanged;
  }

  canSave(): boolean {
    // Must have changes
    if (!this.hasChanges()) return false;

    // Must not be saving
    if (this.isSaving()) return false;

    // If email changed, must be validated as available
    const emailChanged = this.email.trim() !== this.originalEmail;
    if (emailChanged) {
      if (this.emailStatus() === 'taken') return false;
      if (this.emailStatus() === 'checking') return false;
      // If email changed but not validated yet, can't save
      if (this.emailStatus() === 'idle' && this.email.trim() !== this.lastCheckedEmail)
        return false;
    }

    // Must have required fields
    if (!this.firstName.trim() || !this.lastName.trim() || !this.email.trim()) return false;

    return true;
  }

  resetForm(): void {
    this.loadUserData();
    this.selectedFile = null;
    this.photoPreview.set(null);
    this.photoMarkedForRemoval = false;
    this.emailStatus.set('idle');
  }

  private async uploadPhoto(file: File): Promise<string | null> {
    try {
      const createAssetsMutation = `
        mutation CreateAssets($input: [CreateAssetInput!]!) {
          createAssets(input: $input) {
            ... on Asset {
              id
              preview
              source
            }
          }
        }
      `;

      const formData = new FormData();
      formData.append(
        'operations',
        JSON.stringify({
          query: createAssetsMutation,
          variables: { input: [{ file: null }] },
        }),
      );
      formData.append('map', JSON.stringify({ '0': ['variables.input.0.file'] }));
      formData.append('0', file, file.name);

      const headers: Record<string, string> = {};
      const channelToken = this.apolloService.getChannelToken();
      if (channelToken) {
        headers['vendure-token'] = channelToken;
      }

      const response = await fetch(environment.apiUrl, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) return null;

      const result = await response.json();
      if (result.errors) return null;

      const assets = result.data?.createAssets;
      if (!assets?.length || !assets[0].id) return null;

      return assets[0].id;
    } catch {
      return null;
    }
  }

  async saveProfile(): Promise<void> {
    if (!this.canSave()) return;

    this.isSaving.set(true);

    try {
      const input: any = {
        firstName: this.firstName.trim(),
        lastName: this.lastName.trim(),
        email: this.email.trim(),
      };

      // Handle photo upload
      if (this.selectedFile) {
        const assetId = await this.uploadPhoto(this.selectedFile);
        if (!assetId) {
          this.toastService.show('Error', 'Failed to upload profile picture', 'error');
          this.isSaving.set(false);
          return;
        }
        input.profilePictureId = assetId;
      } else if (this.photoMarkedForRemoval && this.originalPhotoId) {
        input.profilePictureId = null;
      }

      const client = this.apolloService.getClient();
      await client.mutate({
        mutation: UPDATE_ADMIN_PROFILE as any,
        variables: { input },
      });

      this.toastService.show('Success', 'Profile updated successfully', 'success');

      // Refetch user data to update UI
      await this.authService.refetchUser();

      // Reset state
      this.selectedFile = null;
      this.photoPreview.set(null);
      this.photoMarkedForRemoval = false;
      this.emailStatus.set('idle');
      this.loadUserData();
    } catch (error) {
      console.error('Failed to update profile:', error);
      this.toastService.show('Error', 'Failed to update profile. Please try again.', 'error');
    } finally {
      this.isSaving.set(false);
    }
  }
}
