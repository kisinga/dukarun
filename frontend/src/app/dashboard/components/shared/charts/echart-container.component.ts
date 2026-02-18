import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-echart-container',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative" [style.height]="height()">
      <div #chartEl class="w-full h-full"></div>
      @if (loading()) {
        <div class="absolute inset-0 flex items-center justify-center bg-base-100/60">
          <span class="loading loading-spinner loading-sm text-primary"></span>
        </div>
      }
    </div>
  `,
})
export class EchartContainerComponent implements OnInit {
  option = input<Record<string, any>>({});
  height = input('200px');

  chartEl = viewChild<ElementRef<HTMLDivElement>>('chartEl');

  private chart: any;
  private readonly chartReady = signal(false);
  private observer?: ResizeObserver;
  protected readonly loading = signal(true);

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      if (!this.chartReady()) return;
      const opt = this.option();
      if (this.chart && opt && Object.keys(opt).length > 0) {
        this.chart.setOption(opt, { notMerge: false });
      }
    });
  }

  async ngOnInit() {
    const [
      { init },
      { BarChart, LineChart },
      { GridComponent, TooltipComponent, LegendComponent },
      { CanvasRenderer },
    ] = await Promise.all([
      import('echarts/core'),
      import('echarts/charts'),
      import('echarts/components'),
      import('echarts/renderers'),
    ]);

    const { use } = await import('echarts/core');
    use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

    const el = this.chartEl()?.nativeElement;
    if (!el) return;

    this.chart = init(el, null, { renderer: 'canvas' });
    this.chart.setOption(this.option());
    this.loading.set(false);
    this.chartReady.set(true);

    this.observer = new ResizeObserver(() => this.chart?.resize());
    this.observer.observe(el);

    this.destroyRef.onDestroy(() => {
      this.observer?.disconnect();
      this.chart?.dispose();
    });
  }

  /** Call to update chart option after init */
  setOption(option: Record<string, any>) {
    this.chart?.setOption(option, { notMerge: false });
  }
}
