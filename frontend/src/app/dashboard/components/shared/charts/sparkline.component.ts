import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-sparkline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="width()" [attr.height]="height()" [attr.viewBox]="viewBox()">
      <polyline
        [attr.points]="points()"
        fill="none"
        [attr.stroke]="color()"
        stroke-width="1.5"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  `,
})
export class SparklineComponent {
  data = input<number[]>([]);
  width = input(80);
  height = input(28);
  color = input('currentColor');

  viewBox = computed(() => `0 0 ${this.width()} ${this.height()}`);

  points = computed(() => {
    const d = this.data();
    if (d.length < 2) return '';
    const w = this.width();
    const h = this.height();
    const pad = 2;
    const min = Math.min(...d);
    const max = Math.max(...d);
    const range = max - min || 1;
    return d
      .map((v, i) => {
        const x = pad + (i / (d.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });
}
