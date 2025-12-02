import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { GET_ADMINISTRATORS } from '../../../../core/graphql/operations.graphql';
import type { GetAdministratorsQuery } from '../../../../core/graphql/generated/graphql';
import { ApolloService } from '../../../../core/services/apollo.service';
import { CompanyService } from '../../../../core/services/company.service';
import {
  InviteAdministratorInput,
  SettingsService,
  Administrator,
} from '../../../../core/services/settings.service';

@Component({
  selector: 'app-admin-management',
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card bg-base-100 shadow-lg">
      <div class="card-body">
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-bold text-lg">Channel Administrators</h3>
          <button class="btn btn-primary btn-sm lg:btn-md gap-2" (click)="openInviteModal()">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            <span class="hidden sm:inline">Invite Admin</span>
            <span class="sm:hidden">Invite</span>
          </button>
        </div>

        <!-- Empty State -->
        @if (administrators().length === 0) {
          <div class="text-center py-12 text-base-content/60">
            <p>No administrators found</p>
          </div>
        }

        <!-- Mobile: Card View -->
        @if (administrators().length > 0) {
          <div class="lg:hidden space-y-3">
            @for (admin of administrators(); track admin.id) {
              <details class="collapse collapse-arrow bg-base-200 border border-base-300 rounded-xl shadow-sm">
                <summary class="collapse-title p-4 min-h-0">
                  <div class="flex gap-3">
                    <div class="avatar placeholder shrink-0">
                      <div class="bg-secondary/10 text-secondary rounded-lg w-12 h-12">
                        <span class="text-base font-semibold">{{
                          getInitials(admin.firstName, admin.lastName)
                        }}</span>
                      </div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-start justify-between gap-2 mb-1">
                        <h3 class="text-base font-bold line-clamp-1 leading-tight">
                          {{ admin.firstName }} {{ admin.lastName }}
                        </h3>
                        @if (admin.user?.verified) {
                          <span class="badge badge-success badge-xs gap-1 shrink-0">
                            <span class="w-1 h-1 bg-success-content rounded-full"></span>
                            Verified
                          </span>
                        } @else {
                          <span class="badge badge-warning badge-xs shrink-0">Pending</span>
                        }
                      </div>
                      <p class="text-xs text-base-content/60 truncate">{{ admin.emailAddress }}</p>
                    </div>
                  </div>
                </summary>
                <div class="collapse-content px-4 pb-4 pt-0">
                  <div class="divider my-2"></div>
                  <div class="space-y-2 mb-4">
                    <div class="text-xs text-base-content/60">Email</div>
                    <div class="text-sm font-medium">{{ admin.emailAddress }}</div>
                  </div>
                  <div class="flex gap-2">
                    @if (!admin.user?.verified) {
                      <button class="btn btn-ghost btn-sm flex-1 gap-1.5" (click)="resendInvite(admin)">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                        Resend
                      </button>
                    }
                    @if (admin.id !== currentAdminId) {
                      <button
                        class="btn btn-error btn-outline btn-sm flex-1 gap-1.5"
                        (click)="removeAdmin(admin)"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                        Remove
                      </button>
                    }
                  </div>
                </div>
              </details>
            }
          </div>

          <!-- Desktop: Table View -->
          <div class="hidden lg:block overflow-x-auto">
            <table class="table table-zebra">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (admin of administrators(); track admin.id) {
                  <tr>
                    <td>
                      <div class="flex items-center gap-3">
                        <div class="avatar placeholder">
                          <div class="bg-secondary/10 text-secondary rounded-full w-10">
                            <span class="text-sm font-semibold">{{
                              getInitials(admin.firstName, admin.lastName)
                            }}</span>
                          </div>
                        </div>
                        <div>
                          <div class="font-bold">{{ admin.firstName }} {{ admin.lastName }}</div>
                        </div>
                      </div>
                    </td>
                    <td>{{ admin.emailAddress }}</td>
                    <td>
                      @if (admin.user?.verified) {
                        <span class="badge badge-success">Verified</span>
                      } @else {
                        <span class="badge badge-warning">Pending</span>
                      }
                    </td>
                    <td>
                      <div class="flex gap-2 justify-end">
                        @if (!admin.user?.verified) {
                          <button class="btn btn-ghost btn-xs" (click)="resendInvite(admin)">
                            Resend
                          </button>
                        }
                        @if (admin.id !== currentAdminId) {
                          <button
                            class="btn btn-ghost btn-xs text-error"
                            (click)="removeAdmin(admin)"
                          >
                            Remove
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>

    <!-- Invite Modal -->
    @if (showInviteModal()) {
      <dialog class="modal modal-open">
        <div class="modal-box">
          <h3 class="font-bold text-lg mb-4">Invite Administrator</h3>
          <form [formGroup]="inviteForm" (ngSubmit)="submitInvite()">
            <div class="form-control mb-4">
              <label class="label">
                <span class="label-text">First Name</span>
              </label>
              <input
                type="text"
                placeholder="Enter first name"
                class="input input-bordered"
                formControlName="firstName"
              />
              @if (inviteForm.get('firstName')?.invalid && inviteForm.get('firstName')?.touched) {
                <label class="label">
                  <span class="label-text-alt text-error">First name is required</span>
                </label>
              }
            </div>

            <div class="form-control mb-4">
              <label class="label">
                <span class="label-text">Last Name</span>
              </label>
              <input
                type="text"
                placeholder="Enter last name"
                class="input input-bordered"
                formControlName="lastName"
              />
              @if (inviteForm.get('lastName')?.invalid && inviteForm.get('lastName')?.touched) {
                <label class="label">
                  <span class="label-text-alt text-error">Last name is required</span>
                </label>
              }
            </div>

            <div class="form-control mb-4">
              <label class="label">
                <span class="label-text">Phone Number</span>
              </label>
              <input
                type="tel"
                placeholder="Enter phone number"
                class="input input-bordered"
                formControlName="phoneNumber"
              />
              @if (
                inviteForm.get('phoneNumber')?.invalid && inviteForm.get('phoneNumber')?.touched
              ) {
                <label class="label">
                  <span class="label-text-alt text-error">Phone number is required</span>
                </label>
              }
            </div>

            <div class="form-control mb-4">
              <label class="label">
                <span class="label-text">Email Address (Optional)</span>
              </label>
              <input
                type="email"
                placeholder="Enter email address"
                class="input input-bordered"
                formControlName="emailAddress"
              />
              @if (
                inviteForm.get('emailAddress')?.invalid && inviteForm.get('emailAddress')?.touched
              ) {
                <label class="label">
                  <span class="label-text-alt text-error">
                    @if (inviteForm.get('emailAddress')?.errors?.['email']) {
                      Please enter a valid email
                    }
                  </span>
                </label>
              }
            </div>

            <div class="modal-action">
              <button type="button" class="btn" (click)="closeInviteModal()">Cancel</button>
              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="inviteForm.invalid || settingsService.loading()"
              >
                @if (settingsService.loading()) {
                  <span class="loading loading-spinner loading-xs"></span>
                }
                Send Invite
              </button>
            </div>
          </form>
        </div>
      </dialog>
    }

    <!-- Error Message -->
    @if (settingsService.error(); as error) {
      <div class="alert alert-error mt-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="stroke-current shrink-0 h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{{ error }}</span>
      </div>
    }
  `,
})
export class AdminManagementComponent {
  readonly settingsService = inject(SettingsService);
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);
  private readonly fb = inject(FormBuilder);

  private readonly administratorsSignal = signal<Administrator[]>([]);
  readonly administrators = this.administratorsSignal.asReadonly();
  readonly showInviteModal = signal(false);
  readonly inviteForm: FormGroup;

  // TODO: Get current admin ID from auth service
  readonly currentAdminId = 'current-admin-id';
  private currentFetchChannelId: string | null = null;

  constructor() {
    this.inviteForm = this.createInviteForm();

    effect(() => {
      const channel = this.companyService.activeChannel();

      if (!channel) {
        this.administratorsSignal.set([]);
        return;
      }

      void this.loadAdministrators(channel.id);
    });
  }

  private createInviteForm(): FormGroup {
    return this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      phoneNumber: ['', [Validators.required]],
      emailAddress: ['', [Validators.email]],
    });
  }

  openInviteModal(): void {
    this.inviteForm.reset();
    this.showInviteModal.set(true);
  }

  closeInviteModal(): void {
    this.showInviteModal.set(false);
    this.inviteForm.reset();
  }

  async submitInvite(): Promise<void> {
    if (this.inviteForm.invalid) return;

    const input: InviteAdministratorInput = {
      firstName: this.inviteForm.value.firstName,
      lastName: this.inviteForm.value.lastName,
      emailAddress: this.inviteForm.value.emailAddress,
      phoneNumber: this.inviteForm.value.phoneNumber,
    };

    const result = await this.settingsService.inviteAdministrator(input);

    if (result) {
      const channel = this.companyService.activeChannel();
      if (channel) {
        await this.loadAdministrators(channel.id);
      }
      this.closeInviteModal();
    }
  }

  async resendInvite(admin: any): Promise<void> {
    // TODO: Implement resend invite functionality
    console.log('Resend invite for:', admin.emailAddress);
  }

  async removeAdmin(admin: any): Promise<void> {
    // TODO: Implement remove admin functionality
    console.log('Remove admin:', admin.emailAddress);
  }

  getInitials(firstName: string, lastName: string): string {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }

  private async loadAdministrators(channelId: string): Promise<void> {
    this.currentFetchChannelId = channelId;
    this.settingsService.loading.set(true);
    this.settingsService.clearError();

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<GetAdministratorsQuery>({
        query: GET_ADMINISTRATORS,
        variables: { options: { take: 100 } },
        fetchPolicy: 'network-only',
      });

      const admins = result.data?.administrators.items ?? [];
      const filtered = admins.filter((admin) =>
        admin.user?.roles?.some((role) =>
          role.channels?.some((channel) => channel.id === channelId),
        ),
      );

      if (this.currentFetchChannelId === channelId) {
        const normalized: Administrator[] = filtered.map((admin) => ({
          id: admin.id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          emailAddress: admin.emailAddress,
          user: admin.user
            ? {
                id: admin.user.id,
                identifier: admin.user.identifier,
                verified: admin.user.verified,
                roles: admin.user.roles?.map((role) => ({
                  id: role.id,
                  code: role.code,
                  channels: role.channels?.map((channel) => ({ id: channel.id })) ?? [],
                })),
              }
            : null,
        }));

        this.administratorsSignal.set(normalized);
      }
    } catch (error) {
      console.error('Failed to load administrators:', error);
      this.settingsService.error.set('Failed to load administrators');
    } finally {
      this.settingsService.loading.set(false);
    }
  }
}
