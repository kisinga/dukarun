import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PackCatalogue } from '@dukarun/pack-types';

/** A counting aid. Counts and transfers continue to post one base-stock quantity. */
@Component({
  selector: 'app-stock-quantity-input',
  imports: [FormsModule],
  template: `
    <div class="grid gap-2">
      @if (packs().length) {
        <select
          class="select select-bordered min-h-11 w-full"
          aria-label="Count in"
          [ngModel]="packId()"
          (ngModelChange)="packId.set($event)"
        >
          <option value="">{{ variant().stock_unit || 'item' }}</option>
          @for (pack of packs(); track pack.id) {
            <option [value]="pack.id">
              {{ pack.name }} · {{ pack.units_per_pack }} {{ variant().stock_unit || 'item' }}
            </option>
          }
        </select>
      }
      <div class="flex gap-2">
        <label class="min-w-0 flex-1">
          <span class="type-caption">{{
            selectedPack()?.name || variant().stock_unit || 'Quantity'
          }}</span>
          <input
            type="number"
            min="0"
            class="input input-bordered min-h-11 w-full"
            [step]="selectedPack() || !variant().allow_fractional ? 1 : 0.001"
            [ngModel]="whole()"
            (ngModelChange)="changeWhole($event)"
          />
        </label>
        @if (selectedPack()) {
          <label class="min-w-0 flex-1">
            <span class="type-caption">Loose {{ variant().stock_unit || 'item' }}</span>
            <input
              type="number"
              min="0"
              step="1"
              class="input input-bordered min-h-11 w-full"
              [ngModel]="loose()"
              (ngModelChange)="changeLoose($event)"
            />
          </label>
        }
      </div>
      @if (selectedPack()) {
        <p class="type-caption" aria-live="polite">
          Total: {{ value() }} {{ variant().stock_unit || 'item' }}
        </p>
      }
    </div>
  `,
})
export class StockQuantityInputComponent {
  readonly variant = input.required<PackCatalogue & { allow_fractional?: boolean | null }>();
  readonly value = input.required<number>();
  readonly valueChange = output<number>();
  protected readonly packId = signal('');
  protected readonly packs = computed(() =>
    (this.variant().packs ?? []).filter(pack => pack.active)
  );
  protected readonly selectedPack = computed(() =>
    this.packs().find(pack => pack.id === this.packId())
  );
  protected readonly whole = computed(() =>
    this.selectedPack()
      ? Math.floor(
          (Number.isFinite(this.value()) ? this.value() : 0) / this.selectedPack()!.units_per_pack
        )
      : this.value()
  );
  protected readonly loose = computed(() =>
    this.selectedPack()
      ? (Number.isFinite(this.value()) ? this.value() : 0) % this.selectedPack()!.units_per_pack
      : 0
  );
  protected changeWhole(value: number | null): void {
    this.valueChange.emit(
      value === null || value < 0 || (this.selectedPack() && !Number.isInteger(value))
        ? NaN
        : value * (this.selectedPack()?.units_per_pack ?? 1) + this.loose()
    );
  }
  protected changeLoose(value: number | null): void {
    this.valueChange.emit(
      value === null || value < 0 || !Number.isInteger(value)
        ? NaN
        : this.whole() * (this.selectedPack()?.units_per_pack ?? 1) + value
    );
  }
}
