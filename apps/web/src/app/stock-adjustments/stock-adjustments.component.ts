import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { formatKes, parseKesToCents } from '../core/money';
import { PosService, Variant, variantLabel } from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { MoneyService } from '../money/money.service';

/** Parse a signed KES amount ("-450.00") to signed cents. Null when invalid. */
function parseSignedKes(raw: string): number | null {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith('-');
  const cents = parseKesToCents(negative ? trimmed.slice(1) : trimmed);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

@Component({
  selector: 'app-stock-adjustments',
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    ButtonComponent,
    MoneyComponent,
    PageLayoutComponent,
  ],
  template: `
    <app-page title="Stock Adjustments">
      @if (error()) {
        <p class="mb-2 text-sm text-error">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="mb-2 text-sm text-success">{{ notice() }}</p>
      }

    <!-- Product search (shared by both forms) -->
    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        <h2 class="section-title mb-2">Product</h2>
        @if (selected(); as v) {
          <div class="flex items-center gap-3">
            <span class="font-semibold">{{ label(v) }}</span>
            <span class="text-xs text-base-content/60">{{ v.sku }}</span>
            <span class="badge badge-xs" [class.badge-info]="v.kind === 'service'">{{
              v.kind
            }}</span>
            <span class="text-xs"><app-money [cents]="v.price ?? 0" /></span>
            <button appButton variant="ghost" (click)="selected.set(null)">Change</button>
          </div>
        } @else {
          <div class="relative">
            <input
              type="text"
              class="input input-bordered input-sm w-full"
              placeholder="Search by name, SKU, or barcode…"
              [formControl]="search"
            />
            @if (results().length > 0) {
              <ul
                class="menu absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-box bg-base-100 shadow-overlay"
              >
                @for (v of results(); track v.variant_id) {
                  <li>
                    <a (click)="pick(v)">
                      <span class="flex-1">{{ label(v) }}</span>
                      <span class="text-xs text-base-content/60">{{ v.sku }}</span>
                    </a>
                  </li>
                }
              </ul>
            }
          </div>
        }
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- Write-off -->
      <div class="card bg-base-100">
        <div class="card-body p-4">
          <h2 class="section-title mb-2">Write off stock</h2>
          <form (submit)="$event.preventDefault(); writeOff()" class="mt-2 flex flex-col gap-3">
            <app-form-field label="Quantity">
              <input
                type="number"
                min="0.001"
                step="any"
                class="input input-bordered input-sm w-full"
                [formControl]="writeOffQty"
              />
            </app-form-field>
            <app-form-field
              label="Reason"
              hint='Reasons containing "expir" post to EXPIRY_LOSS; others to SHRINKAGE.'
            >
              <input
                type="text"
                class="input input-bordered input-sm w-full"
                placeholder="e.g. Expired batch, damaged"
                [formControl]="writeOffReason"
              />
            </app-form-field>
            <button
              appButton
              variant="error"
              type="submit"
              class="self-start"
              [loading]="busy()"
              [disabled]="!selected()"
            >
              Write off
            </button>
          </form>
        </div>
      </div>

      <!-- Value adjustment -->
      <div class="card bg-base-100">
        <div class="card-body p-4">
          <h2 class="section-title mb-2">Value adjustment</h2>
          <form (submit)="$event.preventDefault(); adjust()" class="mt-2 flex flex-col gap-3">
            <app-form-field
              label="Amount (KES, signed)"
              hint="Negative reduces inventory value, positive increases it."
            >
              <input
                type="text"
                class="input input-bordered input-sm w-full"
                placeholder="e.g. -150.00 or 200.00"
                [formControl]="adjustAmount"
              />
            </app-form-field>
            <app-form-field label="Reason">
              <input
                type="text"
                class="input input-bordered input-sm w-full"
                placeholder="e.g. Recount correction"
                [formControl]="adjustReason"
              />
            </app-form-field>
            <button
              appButton
              type="submit"
              class="self-start"
              [loading]="busy()"
              [disabled]="!selected()"
            >
              Post adjustment
            </button>
          </form>
        </div>
      </div>
    </div>
    </app-page>
  `,
})
export class StockAdjustmentsComponent implements OnInit {
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly results = signal<Variant[]>([]);
  protected readonly selected = signal<Variant | null>(null);
  protected readonly label = variantLabel;

  protected readonly writeOffQty = new FormControl(1, { nonNullable: true });
  protected readonly writeOffReason = new FormControl('', { nonNullable: true });
  protected readonly adjustAmount = new FormControl('', { nonNullable: true });
  protected readonly adjustReason = new FormControl('', { nonNullable: true });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(q => void this.onSearch(q));
  }

  ngOnInit(): void {
    // nothing to preload — search drives everything
  }

  protected async onSearch(query: string): Promise<void> {
    const q = query.trim();
    if (q.length < 2) {
      this.results.set([]);
      return;
    }
    try {
      this.results.set(await this.pos.searchVariants(q));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Search failed');
    }
  }

  protected pick(variant: Variant): void {
    this.selected.set(variant);
    this.search.setValue('', { emitEvent: false });
    this.results.set([]);
  }

  protected async writeOff(): Promise<void> {
    const variant = this.selected();
    if (!variant) return;
    if (!(this.writeOffQty.value > 0)) {
      this.error.set('Enter a valid quantity');
      return;
    }
    if (this.writeOffReason.value.trim().length === 0) {
      this.error.set('A reason is required');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.postInventoryWriteOff(
        variant.variant_id!,
        this.writeOffQty.value,
        this.writeOffReason.value.trim()
      );
      this.notice.set(`Wrote off ${this.writeOffQty.value} × ${this.label(variant)}`);
      this.writeOffReason.setValue('');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Write-off failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async adjust(): Promise<void> {
    const variant = this.selected();
    if (!variant) return;
    const cents = parseSignedKes(this.adjustAmount.value);
    if (cents === null || cents === 0) {
      this.error.set('Enter a valid signed amount');
      return;
    }
    if (this.adjustReason.value.trim().length === 0) {
      this.error.set('A reason is required');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.postInventoryAdjustment(
        variant.variant_id!,
        cents,
        this.adjustReason.value.trim()
      );
      this.notice.set(`Adjusted ${this.label(variant)} by ${formatKes(cents)}`);
      this.adjustAmount.setValue('');
      this.adjustReason.setValue('');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Adjustment failed');
    } finally {
      this.busy.set(false);
    }
  }
}
