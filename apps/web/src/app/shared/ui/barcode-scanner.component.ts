import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  output,
  signal,
  viewChild,
} from '@angular/core';

type BarcodeResult = { rawValue: string };
type Detector = { detect(source: CanvasImageSource): Promise<BarcodeResult[]> };
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

@Component({
  selector: 'app-barcode-scanner',
  template: `
    <div
      class="fixed inset-0 z-[80] flex items-end bg-black/75 sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Scan barcode"
    >
      <section class="w-full overflow-hidden rounded-t-box bg-base-100 sm:max-w-lg sm:rounded-box">
        <header class="flex items-center gap-2 border-b border-base-300 px-4 py-3">
          <div>
            <h2 class="font-semibold">Scan barcode</h2>
            <p class="text-xs text-base-content/60">Hold the code inside the frame.</p>
          </div>
          <button class="btn btn-ghost btn-sm ml-auto" (click)="close.emit()">Close</button>
        </header>
        <div class="relative aspect-[4/3] bg-black">
          <video #video class="h-full w-full object-cover" autoplay muted playsinline></video>
          <div
            class="pointer-events-none absolute inset-x-[12%] top-1/2 h-28 -translate-y-1/2 rounded-box border-2 border-primary shadow-[0_0_0_999px_rgba(0,0,0,.25)]"
          ></div>
        </div>
        <div class="px-4 py-3 text-sm">
          @if (error()) {
            <span class="text-error">{{ error() }}</span>
          } @else {
            <span class="text-base-content/60">{{ status() }}</span>
          }
        </div>
      </section>
    </div>
  `,
})
export class BarcodeScannerComponent implements AfterViewInit, OnDestroy {
  readonly scanned = output<string>();
  readonly close = output<void>();
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal('Starting camera…');
  private stream: MediaStream | null = null;
  private fallbackControls: { stop(): void } | null = null;
  private frame = 0;
  private stopped = false;
  async ngAfterViewInit(): Promise<void> {
    const DetectorClass = (globalThis as unknown as { BarcodeDetector?: DetectorConstructor })
      .BarcodeDetector;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      const video = this.video().nativeElement;
      video.srcObject = this.stream;
      await video.play();
      this.status.set('Scanning…');
      if (!DetectorClass) {
        await this.startFallback(video);
        return;
      }
      const detector = new DetectorClass({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
      });
      const scan = async () => {
        if (this.stopped) return;
        try {
          const value = (await detector.detect(video))[0]?.rawValue?.trim();
          if (value) {
            this.scanned.emit(value);
            return;
          }
        } catch {
          /* transient frame */
        }
        this.frame = requestAnimationFrame(() => void scan());
      };
      await scan();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Camera permission was denied.');
    }
  }

  private async startFallback(video: HTMLVideoElement): Promise<void> {
    this.status.set('Loading camera scanner…');
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    if (this.stopped) return;
    const reader = new BrowserMultiFormatReader();
    this.status.set('Scanning…');
    this.fallbackControls = await reader.decodeFromVideoElement(
      video,
      (result, _error, controls) => {
        if (this.stopped || !result) return;
        const value = result.getText().trim();
        if (!value) return;
        controls.stop();
        this.scanned.emit(value);
      }
    );
  }

  ngOnDestroy(): void {
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    this.fallbackControls?.stop();
    this.stream?.getTracks().forEach(track => track.stop());
  }
}
