import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Loading placeholder that mirrors the product grid (mobile-first: 2 columns on phones). */
@Component({
  selector: 'app-skeleton-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      @for (i of items(); track i) {
        <div class="flex flex-col gap-2">
          <div class="skeleton aspect-square w-full rounded-box"></div>
          <div class="skeleton h-4 w-3/4"></div>
          <div class="skeleton h-4 w-1/3"></div>
        </div>
      }
    </div>
  `,
})
export class SkeletonGridComponent {
  readonly count = input(8);
  readonly items = computed(() => Array.from({ length: this.count() }, (_, i) => i));
}
