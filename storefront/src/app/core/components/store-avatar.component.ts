import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Store identity avatar: the merchant's logo if set, otherwise a branded initial tile. Gives every
 * store a consistent, owned-looking mark even before/without a logo.
 */
@Component({
  selector: 'app-store-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (logoUrl()) {
      <img [src]="logoUrl()!" [alt]="name()" [class]="boxClass() + ' object-cover'" />
    } @else {
      <div
        [class]="
          boxClass() +
          ' flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 font-bold text-primary'
        "
      >
        {{ initial() }}
      </div>
    }
  `,
})
export class StoreAvatarComponent {
  readonly name = input('');
  readonly logoUrl = input<string | null>(null);
  readonly boxClass = input('h-10 w-10 rounded-box');
  readonly initial = computed(() => (this.name().trim().charAt(0) || '?').toUpperCase());
}
