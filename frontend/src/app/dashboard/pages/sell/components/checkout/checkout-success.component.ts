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
      @keyframes successFadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes backgroundPulse {
        0%,
        100% {
          opacity: 0;
          transform: scale(1);
        }
        50% {
          opacity: 0.3;
          transform: scale(1.1);
        }
      }

      @keyframes contentSlideIn {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes circleBurst {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        50% {
          transform: scale(1.1);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      @keyframes glowPulse {
        0%,
        100% {
          opacity: 0.3;
          transform: scale(1.2);
        }
        50% {
          opacity: 0.6;
          transform: scale(1.4);
        }
      }

      @keyframes rotateGlow {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes checkmarkPath {
        to {
          stroke-dashoffset: 0;
        }
      }

      @keyframes checkmarkDraw {
        from {
          transform: scale(0.3) rotate(-10deg);
          opacity: 0;
        }
        to {
          transform: scale(1) rotate(0deg);
          opacity: 1;
        }
      }

      @keyframes checkmarkBounce {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.15);
        }
      }

      @keyframes particleFloat1 {
        from {
          opacity: 0.9;
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        to {
          opacity: 0;
          transform: translate(50px, -80px) scale(0.2) rotate(360deg);
        }
      }
      @keyframes particleFloat2 {
        from {
          opacity: 0.9;
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        to {
          opacity: 0;
          transform: translate(35px, -90px) scale(0.2) rotate(360deg);
        }
      }
      @keyframes particleFloat3 {
        from {
          opacity: 0.9;
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        to {
          opacity: 0;
          transform: translate(0px, -100px) scale(0.2) rotate(360deg);
        }
      }
      @keyframes particleFloat4 {
        from {
          opacity: 0.9;
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        to {
          opacity: 0;
          transform: translate(-35px, -90px) scale(0.2) rotate(360deg);
        }
      }
      @keyframes particleFloat5 {
        from {
          opacity: 0.9;
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        to {
          opacity: 0;
          transform: translate(-50px, -80px) scale(0.2) rotate(360deg);
        }
      }
      @keyframes particleFloat6 {
        from {
          opacity: 0.9;
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        to {
          opacity: 0;
          transform: translate(-35px, -70px) scale(0.2) rotate(360deg);
        }
      }
      @keyframes particleFloat7 {
        from {
          opacity: 0.9;
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        to {
          opacity: 0;
          transform: translate(0px, -60px) scale(0.2) rotate(360deg);
        }
      }
      @keyframes particleFloat8 {
        from {
          opacity: 0.9;
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        to {
          opacity: 0;
          transform: translate(35px, -70px) scale(0.2) rotate(360deg);
        }
      }

      @keyframes messageFadeIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes textScaleIn {
        from {
          transform: scale(0.8);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }

      @keyframes amountFadeIn {
        from {
          opacity: 0;
          transform: translateY(15px) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes amountBounce {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.1);
        }
      }

      /* Performance optimizations */
      .success-overlay {
        contain: layout style paint;
        backface-visibility: hidden;
        -webkit-font-smoothing: antialiased;
      }

      .success-overlay {
        animation: successExpandFullscreen 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      @keyframes successExpandFullscreen {
        0% {
          opacity: 0;
          transform: scale(0.85);
          clip-path: inset(8% 8% 8% 8%);
        }
        50% {
          opacity: 1;
          transform: scale(1.02);
        }
        100% {
          opacity: 1;
          transform: scale(1);
          clip-path: inset(0% 0% 0% 0%);
        }
      }

      .success-bg-pulse {
        animation: backgroundPulse 1.8s ease-in-out infinite;
        opacity: 0;
        will-change: opacity, transform;
      }

      .success-content {
        animation: contentSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.05s both;
        will-change: transform, opacity;
      }

      .success-checkmark-container {
        will-change: transform;
        contain: layout style paint;
      }

      .success-glow-pulse {
        animation: glowPulse 1.2s ease-in-out infinite;
        transform: scale(1.2);
        will-change: opacity, transform;
      }

      .success-circle-burst {
        animation: circleBurst 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
        will-change: transform, opacity;
      }

      .success-rotate-glow {
        animation: rotateGlow 1.8s linear infinite;
        will-change: transform;
      }

      .success-checkmark-path {
        stroke-dasharray: 24;
        stroke-dashoffset: 24;
        animation: checkmarkPath 0.35s ease-out 0.15s forwards;
        will-change: stroke-dashoffset;
      }

      .success-checkmark-draw {
        animation: checkmarkDraw 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both;
        will-change: transform, opacity;
      }

      .success-checkmark-bounce {
        animation: checkmarkBounce 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
        will-change: transform;
      }

      .particle-0,
      .particle-1,
      .particle-2,
      .particle-3,
      .particle-4,
      .particle-5,
      .particle-6,
      .particle-7 {
        will-change: transform, opacity;
        contain: layout style paint;
      }

      .particle-0 {
        animation: particleFloat1 0.65s ease-out both;
      }
      .particle-1 {
        animation: particleFloat2 0.65s ease-out both;
      }
      .particle-2 {
        animation: particleFloat3 0.65s ease-out both;
      }
      .particle-3 {
        animation: particleFloat4 0.65s ease-out both;
      }
      .particle-4 {
        animation: particleFloat5 0.65s ease-out both;
      }
      .particle-5 {
        animation: particleFloat6 0.65s ease-out both;
      }
      .particle-6 {
        animation: particleFloat7 0.65s ease-out both;
      }
      .particle-7 {
        animation: particleFloat8 0.65s ease-out both;
      }

      .success-message {
        animation: messageFadeIn 0.4s ease-out 0.55s both;
        will-change: transform, opacity;
      }

      .success-title {
        animation: textScaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.55s both;
        will-change: transform, opacity;
      }

      .success-amount {
        animation: amountFadeIn 0.4s ease-out 0.85s both;
        will-change: transform, opacity;
      }

      .success-amount-value {
        animation: amountBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 1.4s both;
        text-shadow: 0 0 20px rgba(34, 197, 94, 0.3);
        will-change: transform;
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
