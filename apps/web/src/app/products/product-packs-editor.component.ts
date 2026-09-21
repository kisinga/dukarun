import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { packWholesaleComparison, type ProductPack } from '@dukarun/pack-types';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { formatKesInput, parseKes } from '../core/money';

@Component({
  selector: 'app-product-packs-editor',
  imports: [FormsModule, ButtonComponent, FormFieldComponent],
  template: `
    <section class="mt-3 border-t border-base-300 pt-3">
      <div class="flex min-h-11 items-center justify-between gap-3">
        <div>
          <h4 class="text-sm font-semibold">Packs</h4>
          <p class="type-caption">Buy or sell several {{ stockUnit() }} together.</p>
        </div>
        <button appButton type="button" variant="outline" size="sm" (click)="add()">
          Add pack
        </button>
      </div>
      @for (pack of packs(); track pack.id) {
        @if (pack.active) {
          <div class="mt-3 grid gap-3 border-t border-base-200 pt-3 sm:grid-cols-2">
            <app-form-field label="Pack name">
              <input
                class="input input-bordered w-full"
                placeholder="Box or strip"
                [ngModel]="pack.name"
                [ngModelOptions]="{ standalone: true }"
                (ngModelChange)="patch(pack.id, { name: $event })"
              />
            </app-form-field>
            <app-form-field
              [label]="stockUnit() + ' per pack'"
              [hint]="
                savedIds().includes(pack.id)
                  ? 'To change contents, remove this pack and add a replacement.'
                  : ''
              "
            >
              <input
                class="input input-bordered w-full"
                type="number"
                inputmode="numeric"
                min="2"
                step="1"
                [disabled]="savedIds().includes(pack.id)"
                [ngModel]="pack.units_per_pack"
                [ngModelOptions]="{ standalone: true }"
                (ngModelChange)="patch(pack.id, { units_per_pack: +$event })"
              />
            </app-form-field>
            <app-form-field
              label="Selling price per pack (KES)"
              hint="Leave blank if customers cannot buy this pack."
            >
              <input
                class="input input-bordered w-full"
                inputmode="numeric"
                [ngModel]="formatPrice(pack.sale_price)"
                [ngModelOptions]="{ standalone: true }"
                (ngModelChange)="setPrice(pack.id, $event)"
              />
              @if (pack.sale_price !== null && pack.units_per_pack > 1) {
                <p class="type-caption mt-1">{{ perPiece(pack) }} per {{ stockUnit() }}</p>
                @if (comparison(pack); as comparison) {
                  <p class="type-caption">{{ comparison }}</p>
                }
              }
            </app-form-field>
            <app-form-field
              label="Pack barcode"
              hint="Optional. Scanning this code selects this pack."
            >
              <input
                class="input input-bordered w-full font-mono"
                [ngModel]="pack.barcode ?? ''"
                maxlength="64"
                [ngModelOptions]="{ standalone: true }"
                (keydown.enter)="$event.preventDefault()"
                (ngModelChange)="patch(pack.id, { barcode: $event.trim() || null })"
              />
            </app-form-field>
            <button
              appButton
              type="button"
              variant="ghost"
              size="sm"
              class="justify-self-start"
              (click)="remove(pack.id)"
            >
              Remove {{ pack.name || 'pack' }}
            </button>
          </div>
        }
      }
    </section>
  `,
})
export class ProductPacksEditorComponent {
  readonly packs = input<readonly ProductPack[]>([]);
  readonly savedIds = input<readonly string[]>([]);
  readonly stockUnit = input('item');
  readonly wholesale = input<number | null>(null);
  readonly changed = output<ProductPack[]>();

  protected add(): void {
    this.changed.emit([
      ...this.packs(),
      {
        id: crypto.randomUUID(),
        name: '',
        units_per_pack: 10,
        sale_price: null,
        barcode: null,
        active: true,
      },
    ]);
  }
  protected patch(id: string, changes: Partial<ProductPack>): void {
    this.changed.emit(this.packs().map(pack => (pack.id === id ? { ...pack, ...changes } : pack)));
  }
  protected remove(id: string): void {
    if (this.savedIds().includes(id)) this.patch(id, { active: false });
    else this.changed.emit(this.packs().filter(pack => pack.id !== id));
  }
  protected setPrice(id: string, value: string): void {
    this.patch(id, { sale_price: value.trim() ? (parseKes(value) ?? Number.NaN) : null });
  }
  protected formatPrice(value: number | null): string {
    return value === null ? '' : Number.isFinite(value) ? formatKesInput(value) : '';
  }
  protected perPiece(pack: ProductPack): string {
    return (pack.sale_price! / pack.units_per_pack).toLocaleString('en-KE', {
      maximumFractionDigits: 2,
    });
  }
  protected comparison(pack: ProductPack): string {
    return packWholesaleComparison(pack.sale_price!, pack.units_per_pack, this.wholesale());
  }
}
