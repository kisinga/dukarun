import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { PosService, type CategoryWithCount, type ProductCategoryLink } from '../pos/pos.service';
import { CatalogCacheService } from '../core/catalog-cache.service';

type InitialState = 'all' | 'some' | 'none';
type StagedChange = 'add' | 'remove';

@Component({
  selector: 'app-batch-product-categories-dialog',
  imports: [ReactiveFormsModule, ButtonComponent, IconComponent],
  template: `
    <dialog class="modal modal-open" aria-labelledby="batch-category-title">
      <div class="modal-box modal-box-task p-0 md:w-full md:max-w-xl">
        <header class="border-b border-base-300 px-5 py-4">
          <h2 id="batch-category-title" class="text-lg font-semibold">
            Categorize {{ productIds().length }} products
          </h2>
          <p class="type-caption mt-1">Only categories changed here will be updated.</p>
        </header>

        <div class="modal-body p-5">
          @if (!connectivity.online()) {
            <div role="alert" class="alert alert-warning mb-4 text-sm">
              <app-icon name="heroExclamationTriangle" />
              <span>Reconnect before changing product categories.</span>
            </div>
          }
          @if (error()) {
            <div role="alert" class="alert alert-error mb-4 text-sm">
              <app-icon name="heroExclamationTriangle" />
              <span>{{ error() }}</span>
            </div>
          }

          <label class="input input-bordered flex items-center gap-2">
            <app-icon name="heroMagnifyingGlass" class="text-base-content/50" />
            <input
              type="search"
              class="min-w-0 grow"
              placeholder="Search categories…"
              [value]="search()"
              (input)="search.set($any($event.target).value)"
            />
          </label>

          <div class="mt-3 overflow-hidden rounded-box border border-base-300">
            @for (category of visibleCategories(); track category.id) {
              <div
                class="flex min-h-14 items-center gap-3 border-b border-base-200 px-3 last:border-0"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-3 text-left"
                  [disabled]="working() || !connectivity.online()"
                  [attr.aria-label]="categoryActionLabel(category)"
                  (click)="toggle(category.id)"
                >
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm pointer-events-none"
                    tabindex="-1"
                    [checked]="effectiveState(category.id) === 'all'"
                    [indeterminate]="effectiveState(category.id) === 'some'"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium">{{ category.name }}</span>
                    <span class="type-caption block">{{ stateLabel(category.id) }}</span>
                  </span>
                </button>
                @if (staged().has(category.id)) {
                  <button
                    appButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    [disabled]="working()"
                    (click)="undo(category.id)"
                  >
                    Undo
                  </button>
                }
              </div>
            } @empty {
              <p class="p-5 text-center text-sm text-base-content/60">No categories match.</p>
            }
          </div>
          @if (matchingCategories().length > visibleCategories().length) {
            <p class="type-caption mt-2">
              Keep typing to narrow {{ matchingCategories().length }} categories.
            </p>
          }

          <section class="mt-5 border-t border-base-300 pt-4">
            <h3 class="section-title">Create a category</h3>
            <div class="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                class="input input-bordered min-h-11 min-w-0 flex-1"
                placeholder="Category name"
                [formControl]="newCategoryName"
                (keydown.enter)="$event.preventDefault(); createCategory()"
              />
              <button
                appButton
                type="button"
                variant="outline"
                [loading]="creating()"
                [disabled]="
                  working() || !connectivity.online() || newCategoryName.value.trim().length === 0
                "
                (click)="createCategory()"
              >
                <app-icon name="heroPlus" /> Create
              </button>
            </div>
            <p class="type-caption mt-1">
              New categories are created immediately and staged for all selected products.
            </p>
          </section>
        </div>

        <footer class="flex justify-end gap-2 border-t border-base-300 px-5 py-4">
          <button
            appButton
            type="button"
            variant="ghost"
            [disabled]="working()"
            (click)="closed.emit()"
          >
            Cancel
          </button>
          <button
            appButton
            type="button"
            variant="primary"
            [loading]="busy()"
            [disabled]="working() || !connectivity.online() || staged().size === 0"
            (click)="apply()"
          >
            Apply changes
          </button>
        </footer>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="button" aria-label="Close" [disabled]="working()" (click)="closed.emit()">
          close
        </button>
      </form>
    </dialog>
  `,
})
export class BatchProductCategoriesDialogComponent {
  private readonly pos = inject(PosService);
  private readonly catalogCache = inject(CatalogCacheService);
  protected readonly connectivity = inject(ConnectivityService);

  readonly productIds = input.required<readonly string[]>();
  readonly categories = input.required<readonly CategoryWithCount[]>();
  readonly links = input.required<readonly ProductCategoryLink[]>();
  readonly closed = output<void>();
  readonly applied = output<string>();

  protected readonly search = signal('');
  protected readonly newCategoryName = new FormControl('', { nonNullable: true });
  protected readonly staged = signal<Map<string, StagedChange>>(new Map());
  protected readonly busy = signal(false);
  protected readonly creating = signal(false);
  protected readonly working = computed(() => this.busy() || this.creating());
  protected readonly error = signal<string | null>(null);

  protected readonly matchingCategories = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.categories().filter(
      category => category.active && (!query || category.name.toLocaleLowerCase().includes(query))
    );
  });
  protected readonly visibleCategories = computed(() => this.matchingCategories().slice(0, 50));

  private initialState(categoryId: string): InitialState {
    const products = new Set(this.productIds());
    const assigned = new Set(
      this.links()
        .filter(link => link.category_id === categoryId && products.has(link.product_id))
        .map(link => link.product_id)
    ).size;
    if (assigned === 0) return 'none';
    return assigned === products.size ? 'all' : 'some';
  }

  protected effectiveState(categoryId: string): InitialState {
    const change = this.staged().get(categoryId);
    return change === 'add' ? 'all' : change === 'remove' ? 'none' : this.initialState(categoryId);
  }

  protected stateLabel(categoryId: string): string {
    const change = this.staged().get(categoryId);
    if (change === 'add') return `Will add to all ${this.productIds().length}`;
    if (change === 'remove') return `Will remove from all ${this.productIds().length}`;
    const initial = this.initialState(categoryId);
    return initial === 'all'
      ? 'Assigned to all selected'
      : initial === 'some'
        ? 'Assigned to some selected'
        : 'Not assigned';
  }

  protected categoryActionLabel(category: CategoryWithCount): string {
    return `${this.effectiveState(category.id) === 'all' ? 'Remove' : 'Add'} ${category.name} ${
      this.effectiveState(category.id) === 'all' ? 'from' : 'to'
    } all selected products`;
  }

  protected toggle(categoryId: string): void {
    if (this.working() || !this.connectivity.online()) return;
    const next = new Map(this.staged());
    next.set(categoryId, this.effectiveState(categoryId) === 'all' ? 'remove' : 'add');
    this.staged.set(next);
  }

  protected undo(categoryId: string): void {
    if (this.working()) return;
    const next = new Map(this.staged());
    next.delete(categoryId);
    this.staged.set(next);
  }

  protected async createCategory(): Promise<void> {
    const name = this.newCategoryName.value.trim();
    if (!name || this.working() || !this.connectivity.online()) return;
    this.creating.set(true);
    this.error.set(null);
    try {
      const categoryId = await this.pos.upsertCategory({ name });
      await this.catalogCache.refresh();
      const next = new Map(this.staged());
      next.set(categoryId, 'add');
      this.staged.set(next);
      this.newCategoryName.setValue('');
      this.search.set('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not create category');
    } finally {
      this.creating.set(false);
    }
  }

  protected async apply(): Promise<void> {
    if (this.working() || this.staged().size === 0 || !this.connectivity.online()) return;
    const add: string[] = [];
    const remove: string[] = [];
    for (const [categoryId, change] of this.staged()) {
      (change === 'add' ? add : remove).push(categoryId);
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.pos.patchProductCategories([...this.productIds()], add, remove);
      await this.catalogCache.refresh();
      this.applied.emit(
        `Updated ${result.product_count} products · ${result.added_count} added · ${result.removed_count} removed`
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not update categories');
    } finally {
      this.busy.set(false);
    }
  }
}
