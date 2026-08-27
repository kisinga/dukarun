import { Component, inject, input, output, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PosService } from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import type { CategoryWithCount } from '../pos/pos.service';

export interface ProductCategoryChangedResult {
  categoryId: string;
  message: string;
}

@Component({
  selector: 'app-product-categories-panel',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    DeleteConfirmationModalComponent,
    IconComponent,
    MobileListComponent,
    StatusBadgeComponent,
  ],
  template: `
    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        <div class="flex items-center justify-between">
          <h2 class="card-title text-lg">Categories</h2>
          @if (canManageCatalog()) {
            <button
              appButton
              variant="ghost"
              size="sm"
              [disabled]="!online() || !membershipComplete()"
              (click)="startCreate()"
            >
              <app-icon name="heroPlus" /> New category
            </button>
          }
        </div>

        @if (form(); as form) {
          <form
            (submit)="$event.preventDefault(); save()"
            class="mt-2 flex flex-wrap items-end gap-3 rounded-field bg-base-200 p-2"
          >
            <label class="form-control">
              <span class="label-text text-xs">Name *</span>
              <input type="text" class="input input-bordered input-sm" [formControl]="name" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">Slug</span>
              <input
                type="text"
                class="input input-bordered input-sm"
                placeholder="auto"
                [formControl]="slug"
              />
            </label>
            <label class="form-control flex-1">
              <span class="label-text text-xs">Description</span>
              <input
                type="text"
                class="input input-bordered input-sm"
                [formControl]="description"
              />
            </label>
            <button
              appButton
              type="submit"
              size="sm"
              [loading]="busy()"
              [disabled]="
                busy() || !online() || !membershipComplete() || name.value.trim().length === 0
              "
            >
              {{ form.editing ? 'Save' : 'Create' }}
            </button>
            <button
              appButton
              type="button"
              variant="ghost"
              size="sm"
              [disabled]="busy()"
              (click)="formState.set(null)"
            >
              Cancel
            </button>
          </form>
        }

        @if (!membershipComplete()) {
          <div role="status" class="alert alert-warning mt-3 text-sm">
            <app-icon name="heroSignalSlash" />
            <span>{{ dataStatusLabel() }}</span>
          </div>
        } @else if (categories().length === 0) {
          <p class="mt-2 text-sm text-base-content/60">
            No categories yet — group products for the storefront or reports.
          </p>
        } @else {
          <app-mobile-list class="mt-3">
            @for (category of categories(); track category.id) {
              <div mobileListRow>
                <div class="flex min-h-16 items-center gap-3 p-3">
                  <button
                    type="button"
                    class="min-w-0 flex-1 text-left"
                    [disabled]="!canManageCatalog() || !online()"
                    (click)="startEdit(category)"
                  >
                    <span class="block truncate font-semibold">{{ category.name }}</span>
                    <span class="type-caption mt-0.5 block truncate">
                      {{ category.slug }} · {{ category.product_count }} products
                    </span>
                  </button>
                  <app-status-badge
                    size="xs"
                    [type]="category.active ? 'neutral' : 'warning'"
                    [label]="category.active ? 'active' : 'inactive'"
                  />
                  @if (canManageCatalog()) {
                    @if (category.active) {
                      <button
                        appButton
                        variant="ghost"
                        size="sm"
                        [disabled]="busy() || !online()"
                        (click)="confirmDeactivate(category)"
                      >
                        Deactivate
                      </button>
                    } @else {
                      <button
                        appButton
                        variant="outline"
                        size="sm"
                        [disabled]="busy() || !online()"
                        (click)="setActive(category, true)"
                      >
                        Reactivate
                      </button>
                    }
                  }
                </div>
              </div>
            }
          </app-mobile-list>
          <div class="mt-2 hidden lg:block">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th class="text-right">Products</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (category of categories(); track category.id) {
                  <tr>
                    <td class="text-sm font-medium">{{ category.name }}</td>
                    <td class="font-mono text-xs">{{ category.slug }}</td>
                    <td class="text-right">{{ category.product_count }}</td>
                    <td>
                      @if (!category.active) {
                        <app-status-badge size="xs" type="neutral" label="inactive" />
                      }
                    </td>
                    <td class="whitespace-nowrap text-right">
                      @if (canManageCatalog()) {
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          [disabled]="!online()"
                          (click)="startEdit(category)"
                        >
                          Edit
                        </button>
                        @if (category.active) {
                          <button
                            appButton
                            variant="error"
                            size="sm"
                            [disabled]="busy() || !online()"
                            (click)="confirmDeactivate(category)"
                          >
                            Deactivate
                          </button>
                        } @else {
                          <button
                            appButton
                            variant="outline"
                            size="sm"
                            [disabled]="busy() || !online()"
                            (click)="setActive(category, true)"
                          >
                            Reactivate
                          </button>
                        }
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>

    <app-delete-confirmation-modal
      [data]="deactivateData()"
      title="Deactivate category?"
      verb="deactivate"
      confirmButtonText="Deactivate"
      (confirm)="executeDeactivate()"
    />
  `,
})
export class ProductCategoriesPanelComponent {
  readonly categories = input.required<CategoryWithCount[]>();
  readonly canManageCatalog = input.required<boolean>();
  readonly online = input.required<boolean>();
  readonly membershipComplete = input.required<boolean>();
  readonly dataStatusLabel = input.required<string>();

  readonly changed = output<ProductCategoryChangedResult>();
  readonly failed = output<string>();

  private readonly pos = inject(PosService);
  protected readonly formState = signal<{ editing: CategoryWithCount | null } | null>(null);
  protected readonly form = this.formState.asReadonly();
  protected readonly busyState = signal(false);
  protected readonly busy = this.busyState.asReadonly();
  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly slug = new FormControl('', { nonNullable: true });
  protected readonly description = new FormControl('', { nonNullable: true });
  private readonly deactivateTargetState = signal<CategoryWithCount | null>(null);
  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);

  protected startCreate(): void {
    if (!this.canMutate()) return;
    this.formState.set({ editing: null });
    this.name.setValue('');
    this.slug.setValue('');
    this.description.setValue('');
  }

  protected startEdit(category: CategoryWithCount): void {
    if (!this.canMutate()) return;
    this.formState.set({ editing: category });
    this.name.setValue(category.name);
    this.slug.setValue(category.slug);
    this.description.setValue(category.description ?? '');
  }

  protected async save(): Promise<void> {
    const form = this.form();
    const name = this.name.value.trim();
    if (!form || !name || !this.canMutate()) return;
    this.busyState.set(true);
    try {
      const categoryId = await this.pos.upsertCategory({
        name,
        slug: this.slug.value.trim() || undefined,
        description: this.description.value.trim() || undefined,
        ...(form.editing ? { category_id: form.editing.id } : {}),
      });
      this.formState.set(null);
      this.changed.emit({
        categoryId,
        message: form.editing ? 'Category updated' : 'Category created',
      });
    } catch (error) {
      this.failed.emit(error instanceof Error ? error.message : 'Category save failed');
    } finally {
      this.busyState.set(false);
    }
  }

  protected confirmDeactivate(category: CategoryWithCount): void {
    if (!this.canMutate()) return;
    this.deactivateTargetState.set(category);
    this.deleteModal()?.show();
  }

  protected deactivateData() {
    const category = this.deactivateTargetState();
    return category
      ? {
          entityName: category.name,
          relatedCount: category.product_count,
          relatedLabel: 'product',
          warningDetails: ['Products remain available; only this grouping is deactivated.'],
        }
      : { entityName: '' };
  }

  protected async executeDeactivate(): Promise<void> {
    const category = this.deactivateTargetState();
    this.deleteModal()?.hide();
    if (category) await this.setActive(category, false);
    this.deactivateTargetState.set(null);
  }

  protected async setActive(category: CategoryWithCount, active: boolean): Promise<void> {
    if (!this.canMutate()) return;
    this.busyState.set(true);
    try {
      await this.pos.upsertCategory({
        name: category.name,
        slug: category.slug,
        category_id: category.id,
        active,
      });
      this.changed.emit({
        categoryId: category.id,
        message: `${category.name} ${active ? 'reactivated' : 'deactivated'}`,
      });
    } catch (error) {
      this.failed.emit(error instanceof Error ? error.message : 'Category update failed');
    } finally {
      this.busyState.set(false);
    }
  }

  private canMutate(): boolean {
    return this.canManageCatalog() && this.online() && this.membershipComplete() && !this.busy();
  }
}
