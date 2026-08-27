import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PurchasePriceBasis } from '@dukarun/tax-types';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  SearchableFilterComponent,
  type SearchableFilterOption,
} from '../shared/ui/searchable-filter.component';
import type { ExpenseForm, ExpenseSettlement } from './purchase-editor.store';

export interface PurchaseExpensesViewModel {
  expenses: readonly ExpenseForm[];
  accountOptions: readonly SearchableFilterOption[];
  accountsError: string | null;
  canCreateTransfer: boolean;
  priceEntryBasis: PurchasePriceBasis;
}

type ExpenseEditableField = 'category' | 'amount' | 'customCategory' | 'accountCode' | 'memo';

export type PurchaseExpenseIntent =
  | { type: 'add' }
  | { type: 'remove'; key: number }
  | { type: 'show-note'; key: number }
  | { type: 'set-settlement'; key: number; settlement: ExpenseSettlement }
  | { type: 'update'; key: number; field: ExpenseEditableField; value: string };

/** Presentational editor for landed costs. All row mutations return to the aggregate as intents. */
@Component({
  selector: 'app-purchase-expenses-panel',
  imports: [
    FormsModule,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    SearchableFilterComponent,
  ],
  template: `
    @if (viewModel().expenses.length > 0 || showWhenEmpty()) {
      <div class="border-t border-base-300 pt-3" data-purchase-expenses>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="text-sm font-medium">Additional costs</span>
            @if (viewModel().expenses.length > 0) {
              <span class="type-caption ml-2">{{ viewModel().expenses.length }} added</span>
            } @else {
              <span class="type-caption ml-2">Transport, duty, packaging, or loading</span>
            }
          </div>
          <button
            appButton
            variant="ghost"
            size="sm"
            type="button"
            (click)="intent.emit({ type: 'add' })"
          >
            <app-icon name="heroPlus" />
            {{ viewModel().expenses.length > 0 ? 'Add another' : 'Add cost' }}
          </button>
        </div>

        @if (viewModel().expenses.length > 0) {
          <div class="mt-3 grid gap-2">
            @for (expense of viewModel().expenses; track expense.key; let index = $index) {
              <article
                class="rounded-field border border-base-300 p-3"
                [attr.data-expense-key]="expense.key"
              >
                <div
                  class="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(9rem,.8fr)_minmax(8rem,.55fr)_minmax(13rem,1fr)_2.5rem]"
                >
                  <app-form-field label="Cost type">
                    <select
                      class="select select-bordered h-11 w-full"
                      [ngModel]="expense.category"
                      [ngModelOptions]="{ standalone: true }"
                      (ngModelChange)="update(expense.key, 'category', $event)"
                    >
                      <option value="transport">Transport</option>
                      <option value="loading">Loading</option>
                      <option value="packaging">Packaging</option>
                      <option value="duty">Duty</option>
                      <option value="other">Other</option>
                    </select>
                  </app-form-field>
                  <app-form-field
                    [label]="
                      viewModel().priceEntryBasis === 'exclusive' &&
                      expense.settlement === 'supplier_bill'
                        ? 'Amount before VAT'
                        : 'Amount'
                    "
                    [required]="true"
                  >
                    <input
                      class="input input-bordered h-11 w-full text-right"
                      inputmode="numeric"
                      placeholder="0"
                      [ngModel]="expense.amount"
                      [ngModelOptions]="{ standalone: true }"
                      (ngModelChange)="update(expense.key, 'amount', $event)"
                    />
                  </app-form-field>
                  <app-form-field label="This cost is" [required]="true">
                    <select
                      class="select select-bordered h-11 w-full"
                      [ngModel]="expense.settlement"
                      [ngModelOptions]="{ standalone: true }"
                      (ngModelChange)="
                        intent.emit({
                          type: 'set-settlement',
                          key: expense.key,
                          settlement: $event,
                        })
                      "
                    >
                      <option value="" disabled>Choose</option>
                      <option value="supplier_bill">On the supplier invoice</option>
                      @if (viewModel().canCreateTransfer) {
                        <option value="separate">Paid separately</option>
                      }
                    </select>
                  </app-form-field>
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    [iconOnly]="true"
                    type="button"
                    class="justify-self-end md:col-start-2 xl:col-start-auto"
                    title="Remove cost"
                    [attr.aria-label]="'Remove additional cost ' + (index + 1)"
                    (click)="intent.emit({ type: 'remove', key: expense.key })"
                  >
                    <app-icon name="heroXMark" />
                  </button>
                </div>

                @if (expense.category === 'other') {
                  <app-form-field label="Cost name" [required]="true" class="mt-3 block">
                    <input
                      class="input input-bordered h-11 w-full"
                      placeholder="e.g. Port handling"
                      [ngModel]="expense.customCategory"
                      [ngModelOptions]="{ standalone: true }"
                      (ngModelChange)="update(expense.key, 'customCategory', $event)"
                    />
                  </app-form-field>
                }

                @if (expense.settlement === 'separate') {
                  <app-form-field
                    label="Paid from"
                    [required]="true"
                    class="mt-3 block"
                    [error]="
                      viewModel().accountOptions.length === 0
                        ? viewModel().accountsError ||
                          'No cash, bank, or M-Pesa account is configured.'
                        : null
                    "
                  >
                    <app-searchable-filter
                      data-expense-account-picker
                      ariaLabel="Choose account used for this cost"
                      placeholder="Choose cash, bank, or M-Pesa account"
                      searchPlaceholder="Search accounts by name or code..."
                      controlSize="sm"
                      [options]="viewModel().accountOptions"
                      [value]="expense.accountCode"
                      (valueChange)="update(expense.key, 'accountCode', $event)"
                    />
                  </app-form-field>
                }

                @if (expense.noteExpanded) {
                  <app-form-field label="Note" class="mt-3 block">
                    <input
                      class="input input-bordered h-11 w-full"
                      placeholder="Optional note about this cost"
                      [ngModel]="expense.memo"
                      [ngModelOptions]="{ standalone: true }"
                      (ngModelChange)="update(expense.key, 'memo', $event)"
                    />
                  </app-form-field>
                } @else {
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    class="mt-2 text-base-content/60"
                    (click)="intent.emit({ type: 'show-note', key: expense.key })"
                  >
                    <app-icon name="heroPlus" size="sm" /> Add note
                  </button>
                }

                @if (expense.error) {
                  <p class="mt-2 text-sm text-error" role="alert">{{ expense.error }}</p>
                }
              </article>
            }
          </div>
        }
      </div>
    }
  `,
})
export class PurchaseExpensesPanelComponent {
  readonly viewModel = input.required<PurchaseExpensesViewModel>();
  readonly showWhenEmpty = input(false);
  readonly intent = output<PurchaseExpenseIntent>();

  protected update(key: number, field: ExpenseEditableField, value: string): void {
    this.intent.emit({ type: 'update', key, field, value });
  }
}
