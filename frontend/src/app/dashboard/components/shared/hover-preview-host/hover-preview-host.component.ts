import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ComponentRef,
  DestroyRef,
  inject,
  input,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LinkPreviewRegistryService } from '../../../../core/services/link-preview/link-preview-registry.service';

const SHOW_DELAY_MS = 400;
const HIDE_DELAY_MS = 200;

/**
 * Host for optional hover previews. Wraps a trigger (e.g. link); on hover after delay,
 * loads the page-registered preview component and shows it in a small card.
 * Requires previewKey + entityId inputs (provided by parent).
 */
@Component({
  selector: 'app-hover-preview-host',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="dropdown dropdown-end relative inline-block"
      (mouseenter)="onTriggerEnter()"
      (mouseleave)="onTriggerLeave()"
    >
      <div
        tabindex="0"
        role="button"
        class="contents"
        (focus)="onTriggerEnter()"
        (blur)="onTriggerLeave()"
      >
        <ng-content></ng-content>
      </div>
      @if (isOpen) {
        <div
          class="dropdown-content left-0 top-full mt-1 z-50 min-w-52 max-w-xs rounded-box bg-base-100 border border-base-300 shadow-lg p-3"
          (mouseenter)="onContentEnter()"
          (mouseleave)="onContentLeave()"
        >
          @if (loading) {
            <div class="flex items-center justify-center py-6">
              <span class="loading loading-spinner loading-sm text-primary"></span>
            </div>
          }
          <ng-container #previewSlot></ng-container>
        </div>
      }
    </div>
  `,
})
export class HoverPreviewHostComponent {
  private readonly registry = inject(LinkPreviewRegistryService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('previewSlot', { read: ViewContainerRef }) private previewSlot?: ViewContainerRef;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.clearShowTimeout();
      this.clearHideTimeout();
      if (this.componentRef) {
        this.componentRef.destroy();
        this.componentRef = null;
      }
    });
  }

  /** Entity key (e.g. 'customer', 'order'). Required for preview. */
  readonly previewKey = input.required<string>();
  /** Entity id. Required for preview. */
  readonly entityId = input.required<string>();

  isOpen = false;
  loading = false;

  private showTimeout: ReturnType<typeof setTimeout> | null = null;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private componentRef: ComponentRef<unknown> | null = null;

  onTriggerEnter(): void {
    this.clearHideTimeout();
    if (this.isOpen) return;
    this.clearShowTimeout();
    this.showTimeout = setTimeout(() => this.open(), SHOW_DELAY_MS);
  }

  onTriggerLeave(): void {
    this.clearShowTimeout();
    this.startHideTimeout();
  }

  onContentEnter(): void {
    this.clearHideTimeout();
  }

  onContentLeave(): void {
    this.startHideTimeout();
  }

  private clearShowTimeout(): void {
    if (this.showTimeout !== null) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
  }

  private clearHideTimeout(): void {
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  private startHideTimeout(): void {
    this.clearHideTimeout();
    this.hideTimeout = setTimeout(() => {
      this.hideTimeout = null;
      this.close();
    }, HIDE_DELAY_MS);
  }

  private async open(): Promise<void> {
    const key = this.previewKey();
    const id = this.entityId();
    const loader = this.registry.getLoader(key);
    if (!loader || !id) return;

    this.isOpen = true;
    this.loading = true;
    this.cdr.markForCheck();

    try {
      const componentType = await loader();
      await this.renderPreview(componentType, key, id);
    } catch {
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    this.loading = false;
    this.cdr.markForCheck();
  }

  private async renderPreview(componentType: unknown, key: string, id: string): Promise<void> {
    // Defer so ViewChild previewSlot is available after template updates
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
    if (!this.previewSlot) return;
    this.previewSlot.clear();
    const ref = this.previewSlot.createComponent(componentType as any);
    ref.setInput('entityId', id);
    ref.setInput('entityKey', key);
    this.componentRef = ref;
    ref.changeDetectorRef.markForCheck();
  }

  private close(): void {
    if (this.componentRef) {
      this.componentRef.destroy();
      this.componentRef = null;
    }
    this.isOpen = false;
    this.cdr.markForCheck();
  }
}
