import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Multi-step form steps indicator (design system).
 *
 * Use this for any multi-stage form to show progress and allow intuitive
 * navigation between steps. Uses daisyUI steps component; steps are
 * clickable when allowClickToNavigate is true.
 */
@Component({
  selector: 'app-multi-step-form-steps',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="steps steps-horizontal w-full text-xs" role="tablist">
      @for (s of steps(); track $index) {
        <li
          class="step transition-all duration-200"
          [class.step-primary]="currentStep() >= $index + 1"
          [class.cursor-pointer]="allowClickToNavigate()"
          [attr.aria-selected]="currentStep() === $index + 1"
          (click)="allowClickToNavigate() && onStepClick($index)"
        >
          {{ s.label }}
        </li>
      }
    </ul>
  `,
})
export class MultiStepFormStepsComponent {
  /** 1-based current step index */
  readonly currentStep = input.required<number>();
  /** Step labels (order matches step 1, 2, ...) */
  readonly steps = input.required<{ label: string }[]>();
  /** Whether clicking a step navigates to it (default true) */
  readonly allowClickToNavigate = input<boolean>(true);

  readonly stepClick = output<number>();

  onStepClick(index: number): void {
    this.stepClick.emit(index);
  }
}
