import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatKes, parseKesToCents } from '../../core/money';
import { PosService, Product } from '../../pos/pos.service';
import { MoneyService } from '../money.service';

/** Parse a signed KES amount ("-450.00") to signed cents. Null when invalid. */
function parseSignedKes(raw: string): number | null {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith('-');
  const cents = parseKesToCents(negative ? trimmed.slice(1) : trimmed);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

@Component({
  selector: 'app-money-stock',
  imports: [RouterLink, ReactiveFormsModule],
  template: `
    <main class="min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <header class="mb-4 flex items-center gap-3">
          <a routerLink="/dashboard" class="btn btn-ghost btn-sm">← Dashboard</a>
          <h1 class="text-2xl font-bold">Stock Adjustments</h1>
        </header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        <!-- Product search (shared by both forms) -->
        <div class="card mb-4 bg-base-100 shadow">
          <div class="card-body p-4">
            <h2 class="card-title text-lg">Product</h2>
            @if (selected(); as p) {
              <div class="flex items-center gap-3">
                <span class="font-semibold">{{ p.name }}</span>
                <span class="text-xs text-base-content/60">{{ p.sku }}</span>
                <span class="text-xs">{{ fmt(p.price) }}</span>
                <button class="btn btn-ghost btn-xs" (click)="selected.set(null)">Change</button>
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
                    class="menu absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-box bg-base-100 shadow-lg"
                  >
                    @for (p of results(); track p.id) {
                      <li>
                        <a (click)="pick(p)">
                          <span class="flex-1">{{ p.name }}</span>
                          <span class="text-xs text-base-content/60">{{ p.sku }}</span>
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
          <div class="card bg-base-100 shadow">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">Write off stock</h2>
              <form (ngSubmit)="writeOff()" class="mt-2 flex flex-col gap-3">
                <label class="form-control">
                  <span class="label-text">Quantity</span>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    class="input input-bordered input-sm"
                    [formControl]="writeOffQty"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text">Reason</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    placeholder="e.g. Expired batch, damaged"
                    [formControl]="writeOffReason"
                  />
                  <span class="label-text-alt text-base-content/60">
                    Reasons containing "expir" post to EXPIRY_LOSS; others to SHRINKAGE.
                  </span>
                </label>
                <button
                  type="submit"
                  class="btn btn-error btn-outline btn-sm self-start"
                  [disabled]="busy() || !selected()"
                >
                  {{ busy() ? 'Posting…' : 'Write off' }}
                </button>
              </form>
            </div>
          </div>

          <!-- Value adjustment -->
          <div class="card bg-base-100 shadow">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">Value adjustment</h2>
              <form (ngSubmit)="adjust()" class="mt-2 flex flex-col gap-3">
                <label class="form-control">
                  <span class="label-text">Amount (KES, signed)</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    placeholder="e.g. -150.00 or 200.00"
                    [formControl]="adjustAmount"
                  />
                  <span class="label-text-alt text-base-content/60">
                    Negative reduces inventory value, positive increases it.
                  </span>
                </label>
                <label class="form-control">
                  <span class="label-text">Reason</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    placeholder="e.g. Recount correction"
                    [formControl]="adjustReason"
                  />
                </label>
                <button
                  type="submit"
                  class="btn btn-primary btn-sm self-start"
                  [disabled]="busy() || !selected()"
                >
                  {{ busy() ? 'Posting…' : 'Post adjustment' }}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
  `,
})
export class MoneyStockComponent implements OnInit {
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);

  protected readonly fmt = formatKes;
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly results = signal<Product[]>([]);
  protected readonly selected = signal<Product | null>(null);

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
      this.results.set(await this.pos.searchProducts(q));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Search failed');
    }
  }

  protected pick(product: Product): void {
    this.selected.set(product);
    this.search.setValue('', { emitEvent: false });
    this.results.set([]);
  }

  protected async writeOff(): Promise<void> {
    const product = this.selected();
    if (!product) return;
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
        product.id,
        this.writeOffQty.value,
        this.writeOffReason.value.trim()
      );
      this.notice.set(`Wrote off ${this.writeOffQty.value} × ${product.name}`);
      this.writeOffReason.setValue('');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Write-off failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async adjust(): Promise<void> {
    const product = this.selected();
    if (!product) return;
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
      await this.money.postInventoryAdjustment(product.id, cents, this.adjustReason.value.trim());
      this.notice.set(`Adjusted ${product.name} by ${formatKes(cents)}`);
      this.adjustAmount.setValue('');
      this.adjustReason.setValue('');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Adjustment failed');
    } finally {
      this.busy.set(false);
    }
  }
}
