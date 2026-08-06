import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

export type SizeTemplate = 'clothing' | 'packs' | 'custom' | null;

/**
 * Size Template Selector Component
 *
 * Quick-pick templates for common size/pack configurations.
 * Only visible when product is set to multi-variant (Sizes/Packs).
 * Design mirrors measurement-unit-selector for visual harmony.
 */
@Component({
  selector: 'app-size-template-selector',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="space-y-2 anim-fade-in-up">
        <h3 class="text-sm font-medium text-base-content/70">Size options</h3>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-sm transition-all duration-150"
            [class.btn-primary]="selectedTemplate() === 'clothing'"
            [class.btn-outline]="selectedTemplate() !== 'clothing'"
            (click)="onSelectTemplate('clothing')"
          >
            S, M, L, XL
          </button>
          <button
            type="button"
            class="btn btn-sm transition-all duration-150"
            [class.btn-primary]="selectedTemplate() === 'packs'"
            [class.btn-outline]="selectedTemplate() !== 'packs'"
            (click)="onSelectTemplate('packs')"
          >
            1, 3, 6, 12 packs
          </button>
          <button
            type="button"
            class="btn btn-sm btn-ghost transition-all duration-150"
            [class.btn-active]="selectedTemplate() === 'custom'"
            (click)="onSelectTemplate('custom')"
          >
            Custom...
          </button>
        </div>
        <p class="text-xs text-base-content/50">
          @if (selectedTemplate() === 'custom') {
            Define your own sizes in the next step
          } @else if (selectedTemplate()) {
            Variants will be generated automatically
          } @else {
            Choose a template or define custom sizes
          }
        </p>
      </div>
    }
  `,
})
export class SizeTemplateSelectorComponent {
  // Inputs
  readonly visible = input<boolean>(false);
  readonly selectedTemplate = input<SizeTemplate>(null);

  // Outputs
  readonly templateChange = output<SizeTemplate>();

  // Template definitions
  private readonly templates: Record<Exclude<SizeTemplate, null>, string[]> = {
    clothing: ['S', 'M', 'L', 'XL'],
    packs: ['1-pack', '3-pack', '6-pack', '12-pack'],
    custom: [],
  };

  /**
   * Handle template selection
   */
  onSelectTemplate(template: SizeTemplate): void {
    this.templateChange.emit(template);
  }

  /**
   * Get options for a template
   */
  getTemplateOptions(template: SizeTemplate): string[] {
    if (!template || template === 'custom') return [];
    return this.templates[template];
  }
}
