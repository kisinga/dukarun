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
import { CurrencyService } from '../../../../shared/services/currency.service';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-checkout-success',
  standalone: true,
  imports: [CommonModule, NgIcon],
  styles: [
    `
      .success-overlay {
        contain: layout style paint;
        backface-visibility: hidden;
        -webkit-font-smoothing: antialiased;
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
          class="flex flex-col items-center gap-6 sm:gap-8 md:gap-10 relative z-10 max-w-full px-4"
        >
          <!-- Success Checkmark with Enhanced Animation -->
          <div class="relative">
            <!-- Pulsing Glow Circle -->
            <div class="absolute inset-0 bg-success/30 rounded-full blur-xl opacity-50"></div>

            <!-- Main Circle with Bounce -->
            <div
              class="relative w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 bg-success/20 rounded-full flex items-center justify-center success-circle-burst"
            >
              <!-- Rotating Glow Ring -->
              <div
                class="absolute inset-0 rounded-full border-2 sm:border-4 md:border-6 border-success/40 success-rotate-glow"
              ></div>

              <!-- Checkmark icon with bounce animation -->
              <ng-icon
                name="heroCheck"
                size="2.5rem"
                class="text-success relative z-10 success-checkmark-bounce"
              />
            </div>

            <!-- Particle Effects -->
            <div class="absolute inset-0 pointer-events-none overflow-visible">
              @for (i of getParticleArray(); track i) {
                <div
                  class="absolute w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-success rounded-full"
                  [style.left.%]="50"
                  [style.top.%]="50"
                  [style.animation-delay.ms]="350 + i * 25"
                  [class]="'particle-' + (i % 8)"
                ></div>
              }
            </div>
          </div>

          <!-- Success Message with Fade In -->
          <div class="text-center space-y-2 sm:space-y-3 md:space-y-4 success-message">
            <h2 class="type-title text-base-content">Order Confirmed!</h2>
            <p class="type-body text-base-content/60 px-2">
              {{ paymentMethod() }}
            </p>
          </div>

          <!-- Payment Amount with Counting Animation -->
          @if (amount()) {
            <div class="text-center success-amount">
              <div class="type-caption mb-1.5 sm:mb-2">Total Amount</div>
              <div class="type-hero text-success success-amount-value">
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
  private amountAnimationFrame: number | null = null;

  constructor() {
    effect(() => {
      if (this.show() && this.amount()) {
        this.animatedAmount.set(0);
        // Delay counter start to sync with success-amount entrance animation
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
    if (this.amountAnimationFrame) {
      cancelAnimationFrame(this.amountAnimationFrame);
      this.amountAnimationFrame = null;
    }
    this.animatedAmount.set(0);
  }

  getParticleArray(): number[] {
    return Array.from({ length: this.particleCount }, (_, i) => i + 1);
  }

  /**
   * Animate the amount counter using requestAnimationFrame with an easeOutQuad
   * curve — fast ramp then smooth deceleration. Feels satisfying on the sell
   * completion screen.
   */
  private animateAmount(targetAmount: number): void {
    if (this.amountAnimationFrame) {
      cancelAnimationFrame(this.amountAnimationFrame);
    }

    const duration = 700; // ms
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutQuad: fast start, smooth deceleration
      const eased = 1 - (1 - progress) * (1 - progress);

      const current = targetAmount * eased;
      this.animatedAmount.set(Math.round(current * 100) / 100);

      if (progress < 1) {
        this.amountAnimationFrame = requestAnimationFrame(tick);
      } else {
        this.animatedAmount.set(targetAmount);
        this.amountAnimationFrame = null;
      }
    };

    this.amountAnimationFrame = requestAnimationFrame(tick);
  }
}
