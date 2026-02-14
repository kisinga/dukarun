import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { CurrencyService } from '../../../../../core/services/currency.service';

@Component({
  selector: 'app-checkout-success',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      .success-overlay {
        contain: layout style paint;
        backface-visibility: hidden;
        -webkit-font-smoothing: antialiased;
      }

      .success-bg-pulse {
        opacity: 0;
      }

      .success-checkmark-path {
        stroke-dasharray: 24;
        stroke-dashoffset: 0;
      }

      .success-glow-pulse {
        transform: scale(1.2);
      }

      .success-amount-value {
        text-shadow: 0 0 20px rgba(34, 197, 94, 0.3);
      }
    `,
  ],
  template: `
    @if (show()) {
      <div
        class="fixed inset-0 bg-base-100 z-[9999] flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden success-overlay"
      >
        <!-- Background Pulse Effect -->
        <div class="absolute inset-0 bg-success/5 success-bg-pulse"></div>

        <div
          class="flex flex-col items-center gap-6 sm:gap-8 md:gap-10 relative z-10 success-content max-w-full px-4"
        >
          <!-- Success Checkmark with Enhanced Animation -->
          <div class="relative success-checkmark-container">
            <!-- Pulsing Glow Circle -->
            <div
              class="absolute inset-0 bg-success/30 rounded-full blur-xl success-glow-pulse"
            ></div>

            <!-- Main Circle with Bounce -->
            <div
              class="relative w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 bg-success/20 rounded-full flex items-center justify-center success-circle-burst"
            >
              <!-- Rotating Glow Ring -->
              <div
                class="absolute inset-0 rounded-full border-2 sm:border-4 md:border-6 border-success/40 success-rotate-glow"
              ></div>

              <!-- Checkmark SVG with Draw Animation -->
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 text-success relative z-10 success-checkmark-draw success-checkmark-bounce"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M5 13l4 4L19 7"
                  class="success-checkmark-path"
                />
              </svg>
            </div>

            <!-- Particle Effects -->
            <div class="absolute inset-0 pointer-events-none overflow-visible">
              @for (i of getParticleArray(); track i) {
                <div
                  class="absolute w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-success rounded-full particle"
                  [style.left.%]="50"
                  [style.top.%]="50"
                  [style.animation-delay.ms]="350 + i * 25"
                  [style.animation-duration.ms]="650 + i * 40"
                  [class]="'particle-' + (i % 8)"
                ></div>
              }
            </div>
          </div>

          <!-- Success Message with Fade In -->
          <div class="text-center space-y-2 sm:space-y-3 md:space-y-4 success-message">
            <h2
              class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-base-content success-title leading-tight"
            >
              Order Confirmed!
            </h2>
            <p class="text-sm sm:text-base md:text-lg lg:text-xl text-base-content/60 px-2">
              {{ paymentMethod() }}
            </p>
          </div>

          <!-- Payment Amount with Counting Animation -->
          @if (amount()) {
            <div class="text-center success-amount">
              <div
                class="text-xs sm:text-sm md:text-base lg:text-lg text-base-content/60 mb-1.5 sm:mb-2 md:mb-3"
              >
                Total Amount
              </div>
              <div
                class="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-success text-tabular success-amount-value leading-none"
              >
                {{ currencyService.format(animatedAmount()) }}
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutSuccessComponent implements OnDestroy {
  readonly currencyService = inject(CurrencyService);

  readonly show = input.required<boolean>();
  readonly amount = input.required<number | null>();
  readonly paymentMethod = input.required<string | null>();

  readonly animatedAmount = signal<number>(0);
  readonly particleCount = 25;
  private amountAnimationInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      if (this.show() && this.amount()) {
        this.animatedAmount.set(0);
        setTimeout(() => this.animateAmount(this.amount()!), 850);
      } else if (!this.show()) {
        this.resetState();
      }
    });
  }

  ngOnDestroy(): void {
    this.resetState();
  }

  private resetState(): void {
    if (this.amountAnimationInterval) {
      clearInterval(this.amountAnimationInterval);
      this.amountAnimationInterval = null;
    }
    this.animatedAmount.set(0);
  }

  getParticleArray(): number[] {
    return Array.from({ length: this.particleCount }, (_, i) => i + 1);
  }

  private animateAmount(targetAmount: number): void {
    if (this.amountAnimationInterval) {
      clearInterval(this.amountAnimationInterval);
    }

    const duration = 600;
    const steps = 25;
    const stepDuration = duration / steps;
    const stepAmount = targetAmount / steps;
    let currentStep = 0;

    this.amountAnimationInterval = setInterval(() => {
      currentStep++;
      const currentAmount = Math.min(stepAmount * currentStep, targetAmount);
      this.animatedAmount.set(Math.round(currentAmount * 100) / 100);

      if (currentStep >= steps) {
        if (this.amountAnimationInterval) {
          clearInterval(this.amountAnimationInterval);
          this.amountAnimationInterval = null;
        }
        this.animatedAmount.set(targetAmount);
      }
    }, stepDuration);
  }
}
