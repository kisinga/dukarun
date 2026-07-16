import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';

export interface EchartClickPayload {
  name?: string;
  dataIndex: number;
  value?: unknown;
}

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

  /** Emits when user clicks a data point (e.g. bar). Payload includes name (e.g. date), dataIndex, value. */
  chartClick = output<EchartClickPayload>();

  chartEl = viewChild<ElementRef<HTMLDivElement>>('chartEl');

  private chart: any;
  private readonly chartReady = signal(false);
  private observer?: ResizeObserver;
  private clickHandler?: (params: any) => void;
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

    this.clickHandler = (params: { name?: string; dataIndex?: number; value?: unknown }) => {
      if (params?.dataIndex != null) {
        this.chartClick.emit({
          name: params.name,
          dataIndex: params.dataIndex,
          value: params.value,
        });
      }
    };
    this.chart.on('click', this.clickHandler);

    this.observer = new ResizeObserver(() => this.chart?.resize());
    this.observer.observe(el);

    this.destroyRef.onDestroy(() => {
      if (this.chart && this.clickHandler) {
        this.chart.off('click', this.clickHandler);
      }
      this.observer?.disconnect();
      this.chart?.dispose();
    });
  }

  /** Call to update chart option after init */
  setOption(option: Record<string, any>) {
    this.chart?.setOption(option, { notMerge: false });
  }
}
