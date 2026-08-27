import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EntitlementsService } from '../core/entitlements.service';
import { PermissionsService } from '../core/permissions.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import type { StockLocationRow } from './settings.service';
import { StockLocationsStore } from './stock-locations.store';

@Component({
  selector: 'app-stock-locations-settings',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    DeleteConfirmationModalComponent,
    FormFieldComponent,
    IconComponent,
    MobileListComponent,
  ],
  template: `
    <div class="card bg-base-100">
      <div class="card-body p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="section-title">Stock locations</h2>
              @if (entitlements.snapshot(); as plan) {
                <span class="badge badge-outline badge-sm">{{ plan.tierName ?? 'No plan' }}</span>
              }
            </div>
            <p class="type-caption mt-1">
              Locations separate where purchases are received and stock is held.
              @if (locationLimit(); as limit) {
                {{ locations().length }} of {{ limit }} used.
              }
            </p>
          </div>
          @if (perms.has('ManageStockAdjustments')) {
            <button
              appButton
              variant="outline"
              class="shrink-0"
              [disabled]="!canAddLocation() || loading()"
              (click)="startCreate()"
            >
              <app-icon name="heroPlus" />
              Add location
            </button>
          }
        </div>

        @if (loadError(); as error) {
          <div class="alert alert-error mt-3 text-sm">
            <app-icon name="heroExclamationTriangle" />
            <span class="flex-1">{{ error }}</span>
            <button appButton variant="ghost" size="sm" type="button" (click)="load(true)">
              Retry
            </button>
          </div>
        } @else if (!entitlements.enabled('multipleLocations') && locations().length > 0) {
          <div class="alert alert-info mt-3 text-sm">
            <app-icon name="heroInformationCircle" />
            <span class="flex-1">
              Multiple locations are not included in your current plan. You can still rename and
              maintain the default location.
            </span>
            <a
              routerLink="/settings"
              [queryParams]="{ tab: 'billing' }"
              class="link whitespace-nowrap font-semibold"
              >View plans</a
            >
          </div>
        } @else if (!canAddLocation() && locationLimit() !== null) {
          <div class="alert alert-warning mt-3 text-sm">
            <app-icon name="heroExclamationTriangle" />
            <span class="flex-1">Your plan's stock-location limit has been reached.</span>
            <a
              routerLink="/settings"
              [queryParams]="{ tab: 'billing' }"
              class="link whitespace-nowrap font-semibold"
              >Upgrade</a
            >
          </div>
        }

        @if (formOpen()) {
          <form
            (submit)="$event.preventDefault(); save()"
            class="mt-3 grid gap-3 border-t border-base-300 pt-3 sm:grid-cols-2"
          >
            <app-form-field label="Location name" [required]="true">
              <input class="input input-bordered input-sm w-full" [formControl]="name" />
            </app-form-field>
            <app-form-field label="Code" [required]="true" hint="Short uppercase code, e.g. WEST.">
              <input
                class="input input-bordered input-sm w-full uppercase"
                placeholder="e.g. WEST"
                [formControl]="code"
              />
            </app-form-field>
            <label class="label cursor-pointer justify-start gap-2 py-0 sm:col-span-2">
              <input type="checkbox" class="checkbox checkbox-sm" [formControl]="isDefault" />
              <span class="label-text">Use as the default receiving location</span>
            </label>
            <div class="flex gap-2 sm:col-span-2">
              <button
                appButton
                type="submit"
                [loading]="busy()"
                [disabled]="name.value.trim().length === 0 || code.value.trim().length === 0"
              >
                {{ editingLocation() ? 'Save location' : 'Create location' }}
              </button>
              <button appButton variant="ghost" type="button" (click)="closeForm()">Cancel</button>
            </div>
          </form>
        }

        @if (message(); as message) {
          <p
            class="mt-2 text-sm"
            [class.text-success]="message.ok"
            [class.text-error]="!message.ok"
          >
            {{ message.text }}
          </p>
        }

        @if (loading() && locations().length === 0) {
          <div class="mt-3 grid gap-2" aria-label="Loading stock locations">
            <div class="skeleton h-14 w-full"></div>
            <div class="skeleton h-14 w-full"></div>
          </div>
        } @else {
          <app-mobile-list class="mt-3">
            @for (location of locations(); track location.id) {
              <div mobileListRow class="p-3">
                <div class="flex items-center gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <p class="truncate font-semibold">{{ location.name }}</p>
                      @if (location.is_default) {
                        <span class="badge badge-primary badge-xs">Default</span>
                      }
                    </div>
                    <p class="type-caption mt-1 font-mono">{{ location.code }}</p>
                  </div>
                  @if (perms.has('ManageStockAdjustments')) {
                    <button appButton variant="ghost" size="sm" (click)="startEdit(location)">
                      Edit
                    </button>
                    @if (!location.is_default) {
                      <button appButton variant="error" size="sm" (click)="startDelete(location)">
                        Delete
                      </button>
                    }
                  }
                </div>
              </div>
            } @empty {
              <p class="type-caption p-3">No stock locations configured.</p>
            }
          </app-mobile-list>
          <div class="mt-3 hidden lg:block">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (location of locations(); track location.id) {
                  <tr>
                    <td class="font-medium">{{ location.name }}</td>
                    <td class="font-mono text-xs">{{ location.code }}</td>
                    <td>
                      @if (location.is_default) {
                        <span class="badge badge-primary badge-sm">Default</span>
                      } @else {
                        <span class="badge badge-ghost badge-sm">Additional</span>
                      }
                    </td>
                    <td class="whitespace-nowrap text-right">
                      @if (perms.has('ManageStockAdjustments')) {
                        <button appButton variant="ghost" size="sm" (click)="startEdit(location)">
                          Edit
                        </button>
                        @if (!location.is_default) {
                          <button
                            appButton
                            variant="error"
                            size="sm"
                            (click)="startDelete(location)"
                          >
                            Delete
                          </button>
                        }
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="type-caption">No stock locations configured.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>

    <app-delete-confirmation-modal
      [data]="deleteData()"
      title="Delete stock location?"
      entityType="location"
      verb="delete"
      confirmButtonText="Delete location"
      (confirm)="confirmDelete()"
      (cancel)="deletingLocation.set(null)"
    />
  `,
})
export class StockLocationsSettingsComponent implements OnInit {
  private readonly stockLocations = inject(StockLocationsStore);
  protected readonly entitlements = inject(EntitlementsService);
  protected readonly perms = inject(PermissionsService);

  protected readonly locations = this.stockLocations.locations;
  protected readonly loading = this.stockLocations.loading;
  protected readonly loadError = this.stockLocations.error;
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editingLocation = signal<StockLocationRow | null>(null);
  protected readonly deletingLocation = signal<StockLocationRow | null>(null);
  protected readonly locationLimit = computed(() => this.entitlements.limit('maxStockLocations'));
  protected readonly canAddLocation = computed(() => {
    if (this.locations().length === 0) return true;
    if (!this.entitlements.enabled('multipleLocations')) return false;
    const limit = this.locationLimit();
    return limit === null || this.locations().length < limit;
  });
  protected readonly deleteData = computed(() => ({
    entityName: this.deletingLocation()?.name ?? 'location',
    warningDetails: ['Locations with inventory or purchase history cannot be deleted.'],
  }));

  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly code = new FormControl('', { nonNullable: true });
  protected readonly isDefault = new FormControl(false, { nonNullable: true });

  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(force = false): Promise<void> {
    try {
      await this.stockLocations.load(force);
    } catch {
      // The store owns the visible load error.
    }
  }

  protected startCreate(): void {
    if (!this.canAddLocation()) return;
    this.editingLocation.set(null);
    this.name.setValue('');
    this.code.setValue('');
    this.isDefault.setValue(false);
    this.message.set(null);
    this.formOpen.set(true);
  }

  protected startEdit(location: StockLocationRow): void {
    this.editingLocation.set(location);
    this.name.setValue(location.name);
    this.code.setValue(location.code);
    this.isDefault.setValue(location.is_default);
    this.message.set(null);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingLocation.set(null);
  }

  protected async save(): Promise<void> {
    const name = this.name.value.trim();
    const code = this.code.value.trim();
    if (!name || !code) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      const editing = this.editingLocation();
      if (editing) {
        await this.stockLocations.update(editing.id, code, name, this.isDefault.value);
      } else {
        await this.stockLocations.create(code, name, this.isDefault.value);
      }
      this.closeForm();
      this.message.set({
        ok: true,
        text: editing ? 'Location updated' : 'Location created',
      });
    } catch (error) {
      this.message.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Location save failed',
      });
    } finally {
      this.busy.set(false);
    }
  }

  protected startDelete(location: StockLocationRow): void {
    this.deletingLocation.set(location);
    this.deleteModal()?.show();
  }

  protected async confirmDelete(): Promise<void> {
    const location = this.deletingLocation();
    if (!location) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      await this.stockLocations.delete(location.id);
      this.deleteModal()?.hide();
      this.deletingLocation.set(null);
      this.message.set({ ok: true, text: 'Location deleted' });
    } catch (error) {
      this.message.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Location delete failed',
      });
    } finally {
      this.busy.set(false);
    }
  }
}
