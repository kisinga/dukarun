import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKesInput, parseKes } from '../core/money';
import { MoneyService } from '../money/money.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import type { SupplierWithAp } from './supplier.types';

export type SupplierProfileFormResult = {
  supplierId: string;
  mode: 'created' | 'updated';
};

/**
 * Supplier profile form boundary.
 *
 * This child owns identity/contact/tax PIN/credit-term form state and the MoneyService create/update
 * calls for those fields. SuppliersComponent owns drawer navigation, list refresh, and financial
 * panels. Keep payment, purchase history, advance, and account-correction workflows out of this form.
 */
@Component({
  selector: 'app-supplier-profile-form',
  imports: [ReactiveFormsModule, ButtonComponent, FormFieldComponent],
  template: `
    <form (submit)="$event.preventDefault(); save()" class="flex flex-col gap-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <p class="type-caption">
          Contact details are kept separate from purchase and payment history.
        </p>
        @if (dirty()) {
          <span class="badge badge-warning badge-sm">Unsaved profile</span>
        }
      </div>

      @if (message(); as m) {
        <p
          role="alert"
          class="rounded-field border px-3 py-2 text-sm"
          [class.border-error]="!m.ok"
          [class.bg-error/10]="!m.ok"
          [class.text-error]="!m.ok"
          [class.border-success]="m.ok"
          [class.bg-success/10]="m.ok"
          [class.text-success]="m.ok"
        >
          {{ m.text }}
        </p>
      }

      <div class="grid gap-3 sm:grid-cols-2">
        <app-form-field label="Supplier name" [required]="true" class="sm:col-span-2">
          <input
            type="text"
            class="input input-bordered input-sm w-full"
            autocomplete="organization"
            [formControl]="name"
          />
        </app-form-field>
        <app-form-field label="Phone">
          <input
            type="tel"
            class="input input-bordered input-sm w-full"
            autocomplete="tel"
            [formControl]="phone"
          />
        </app-form-field>
        <app-form-field label="Email">
          <input
            type="email"
            class="input input-bordered input-sm w-full"
            autocomplete="email"
            [formControl]="email"
          />
        </app-form-field>
        <app-form-field
          label="Supplier tax PIN"
          hint="Used as reusable evidence when claiming input VAT from supplier invoices."
          class="sm:col-span-2"
        >
          <input
            type="text"
            class="input input-bordered input-sm w-full"
            autocomplete="off"
            placeholder="e.g. P000000000A"
            [formControl]="taxPin"
          />
        </app-form-field>
        <app-form-field label="Notes" class="sm:col-span-2">
          <textarea
            class="textarea textarea-bordered min-h-20 w-full text-sm"
            placeholder="Contact person, delivery notes..."
            [formControl]="notes"
          ></textarea>
        </app-form-field>
      </div>

      @if (canManageCredit()) {
        <section class="rounded-box border border-base-300/70 p-3">
          <p class="mb-3 text-xs font-semibold uppercase text-base-content/60">Credit terms</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <app-form-field
              label="Credit limit (KES)"
              hint="Use 0 when this supplier has no configured cap."
            >
              <input
                type="text"
                inputmode="numeric"
                class="input input-bordered input-sm w-full"
                [formControl]="creditLimit"
              />
            </app-form-field>
            <app-form-field label="Credit terms (days)">
              <input
                type="number"
                min="0"
                class="input input-bordered input-sm w-full"
                [formControl]="termsDays"
              />
            </app-form-field>
          </div>
        </section>
      }

      <div class="flex flex-wrap gap-2">
        <button
          appButton
          type="submit"
          [loading]="busy()"
          [disabled]="name.value.trim().length === 0"
        >
          {{ supplier() ? 'Save changes' : 'Create supplier' }}
        </button>
        <button
          appButton
          variant="ghost"
          type="button"
          [disabled]="busy()"
          (click)="cancelled.emit()"
        >
          Cancel
        </button>
      </div>
    </form>
  `,
})
export class SupplierProfileFormComponent {
  private readonly money = inject(MoneyService);
  private appliedSupplierId: string | null | undefined;

  readonly supplier = input<SupplierWithAp | null>(null);
  readonly canManageCredit = input(false);
  readonly saved = output<SupplierProfileFormResult>();
  readonly cancelled = output<void>();
  readonly failed = output<string>();

  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);

  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly phone = new FormControl('', { nonNullable: true });
  protected readonly email = new FormControl('', { nonNullable: true });
  protected readonly taxPin = new FormControl('', { nonNullable: true });
  protected readonly notes = new FormControl('', { nonNullable: true });
  protected readonly creditLimit = new FormControl('0', { nonNullable: true });
  protected readonly termsDays = new FormControl(0, { nonNullable: true });

  constructor() {
    effect(() => {
      const supplier = this.supplier();
      const supplierId = supplier?.id ?? null;
      if (supplierId === this.appliedSupplierId) return;
      this.appliedSupplierId = supplierId;
      this.applySupplier(supplier);
    });
  }

  protected dirty(): boolean {
    return this.controls().some(control => control.dirty);
  }

  protected async save(): Promise<void> {
    const supplierName = this.name.value.trim();
    if (!supplierName) return;
    const creditLimit = parseKes(this.creditLimit.value);
    if (this.canManageCredit() && creditLimit === null) {
      this.message.set({ ok: false, text: 'Enter a valid supplier credit limit' });
      this.failed.emit('Enter a valid supplier credit limit');
      return;
    }

    this.busy.set(true);
    this.message.set(null);
    try {
      const editing = this.supplier();
      const phone = this.phone.value.trim();
      const email = this.email.value.trim();
      const notes = this.notes.value.trim();
      const taxPin = this.taxPin.value.trim();

      if (editing) {
        await this.money.updateCustomer(editing.id, {
          first_name: supplierName,
          last_name: '',
          phone,
          email,
          notes,
        });
        await this.money.updateSupplierTaxRegistration(editing.id, taxPin);
        if (this.canManageCredit()) {
          await this.money.updateSupplierCredit(editing.id, creditLimit!, this.termsDays.value);
        }
        this.markPristine();
        this.saved.emit({ supplierId: editing.id, mode: 'updated' });
      } else {
        const supplierId = await this.money.createCustomer(
          supplierName,
          undefined,
          phone || undefined,
          email || undefined,
          true
        );
        if (notes) {
          await this.money.updateCustomer(supplierId, { notes });
        }
        if (taxPin) {
          await this.money.updateSupplierTaxRegistration(supplierId, taxPin);
        }
        if (this.canManageCredit()) {
          await this.money.updateSupplierCredit(supplierId, creditLimit!, this.termsDays.value);
        }
        this.reset();
        this.saved.emit({ supplierId, mode: 'created' });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : this.supplier() ? 'Save failed' : 'Create failed';
      this.message.set({ ok: false, text: message });
      this.failed.emit(message);
    } finally {
      this.busy.set(false);
    }
  }

  private applySupplier(supplier: SupplierWithAp | null): void {
    if (!supplier) {
      this.reset();
      return;
    }
    this.name.setValue(this.supplierName(supplier));
    this.phone.setValue(supplier.phone ?? '');
    this.email.setValue(supplier.email ?? '');
    this.taxPin.setValue(supplier.tax_registration_number ?? '');
    this.notes.setValue(supplier.notes ?? '');
    this.creditLimit.setValue(formatKesInput(supplier.supplier_credit_limit));
    this.termsDays.setValue(supplier.supplier_credit_terms_days ?? 0);
    this.message.set(null);
    this.markPristine();
  }

  private reset(): void {
    this.name.setValue('');
    this.phone.setValue('');
    this.email.setValue('');
    this.taxPin.setValue('');
    this.notes.setValue('');
    this.creditLimit.setValue('0');
    this.termsDays.setValue(0);
    this.message.set(null);
    this.markPristine();
  }

  private markPristine(): void {
    for (const control of this.controls()) {
      control.markAsPristine();
    }
  }

  private controls(): Array<FormControl<string> | FormControl<number>> {
    return [
      this.name,
      this.phone,
      this.email,
      this.taxPin,
      this.notes,
      this.creditLimit,
      this.termsDays,
    ];
  }

  private supplierName(supplier: SupplierWithAp): string {
    return [supplier.first_name, supplier.last_name].filter(Boolean).join(' ');
  }
}
