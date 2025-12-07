import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';
import {
  PaymentMethod,
  PaymentMethodService,
} from '../../../../core/services/payment-method.service';
import { Customer, CustomerSelectorComponent } from './customer-selector.component';

type CheckoutType = 'credit' | 'cashier' | 'cash' | null;
type PaymentMethodCode = string;

/**
 * Unified checkout modal handling all payment flows
 */
@Component({
  selector: 'app-checkout-modal',
  imports: [CommonModule, CustomerSelectorComponent],
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
    @if (isOpen()) {
      <div class="modal modal-open modal-bottom sm:modal-middle animate-in fade-in duration-300">
        <!-- Success Animation (Full-Screen Overlay) - Outside modal-box to break constraints -->
        @if (showSuccessAnimation()) {
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
                  {{ confirmedPaymentMethod() }}
                </p>
              </div>

              <!-- Payment Amount with Counting Animation -->
              @if (confirmedAmount()) {
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

        @if (!showSuccessAnimation()) {
          <div
            class="modal-box max-w-2xl p-0 max-h-[90vh] sm:max-h-[95vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300 relative"
          >
            <!-- Modal Header -->
            <div
              class="bg-base-100 p-3 sm:p-4 border-b border-base-300 flex items-center justify-between flex-shrink-0"
            >
              <div class="flex items-center gap-2">
                <div class="indicator">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3 sm:h-4 sm:w-4 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span class="indicator-item badge badge-primary badge-xs sm:badge-sm">{{
                    itemCount()
                  }}</span>
                </div>
                <h3 class="font-bold text-sm sm:text-base">Checkout</h3>
              </div>
              <button
                class="btn btn-ghost btn-sm btn-circle hover:bg-base-200 transition-colors"
                (click)="closeModal.emit()"
                aria-label="Close checkout"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-3 sm:p-4 relative">
              <!-- Error Alert -->
              @if (error()) {
                <div
                  role="alert"
                  class="alert alert-error mb-3 animate-in slide-in-from-top-2 duration-300"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span class="text-sm">{{ error() }}</span>
                </div>
              }

              <!-- Cashier Flow -->
              @if (checkoutType() === 'cashier' && !showSuccessAnimation()) {
                <div class="space-y-4 animate-in slide-in-from-left-2 duration-300">
                  <div class="text-center">
                    <div
                      class="inline-flex items-center justify-center w-8 h-8 bg-info/10 rounded-full mb-3"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 text-info"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                    </div>
                    <h4 class="font-bold text-lg sm:text-xl mb-1">Send to Cashier</h4>
                  </div>

                  <!-- Order Summary -->
                  <div
                    class="bg-base-200 rounded-xl p-4 sm:p-6 animate-in slide-in-from-bottom-2 duration-300 delay-100"
                  >
                    <div class="flex justify-between items-center mb-2">
                      <span class="text-xs sm:text-sm text-base-content/60">Items</span>
                      <span class="font-semibold text-base sm:text-lg">{{ itemCount() }}</span>
                    </div>
                    <div class="divider my-2"></div>
                    <div class="flex justify-between items-center">
                      <span class="font-bold text-base sm:text-xl">Total</span>
                      <span class="text-2xl sm:text-3xl font-bold text-info text-tabular">
                        {{ currencyService.format(total()) }}
                      </span>
                    </div>
                  </div>

                  <button
                    class="btn btn-info btn-md sm:btn-lg w-full hover:scale-105 active:scale-95 transition-transform animate-in slide-in-from-bottom-2 duration-300 delay-200 min-h-[44px]"
                    (click)="onCompleteCashier()"
                    [disabled]="isProcessing()"
                  >
                    @if (isProcessing()) {
                      <span class="loading loading-spinner"></span>
                    } @else {
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                        />
                      </svg>
                    }
                    Submit to Cashier
                  </button>
                </div>
              }

              <!-- Credit Sale Flow -->
              @if (checkoutType() === 'credit' && !showSuccessAnimation()) {
                <div class="space-y-4 animate-in slide-in-from-left-2 duration-300">
                  <div class="text-center">
                    <div
                      class="inline-flex items-center justify-center w-8 h-8 bg-warning/10 rounded-full mb-3"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 text-warning"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <h4 class="font-bold text-lg sm:text-xl mb-1">Credit Sale</h4>
                  </div>

                  <div class="animate-in slide-in-from-top-2 duration-300 delay-100">
                    <app-customer-selector
                      [selectedCustomer]="selectedCustomer()"
                      [searchResults]="customerSearchResults()"
                      [isSearching]="isSearchingCustomers()"
                      [isCreating]="isProcessing()"
                      (searchTermChange)="customerSearch.emit($event)"
                      (customerSelect)="customerSelect.emit($event)"
                      (customerCreate)="customerCreate.emit($event)"
                    />
                  </div>

                  <!-- Complete Credit Sale -->
                  @if (selectedCustomer()) {
                    <div class="space-y-4 animate-in slide-in-from-bottom-2 duration-300 delay-200">
                      <div class="grid grid-cols-3 gap-2">
                        <div class="bg-base-200 rounded-xl p-3 text-center">
                          <div class="text-xs text-base-content/60 uppercase tracking-wide">
                            Limit
                          </div>
                          <div class="text-base sm:text-lg font-bold text-base-content">
                            {{ selectedCustomer()!.creditLimit | number: '1.0-0' }}
                          </div>
                        </div>
                        <div class="bg-base-200 rounded-xl p-3 text-center">
                          <div class="text-xs text-base-content/60 uppercase tracking-wide">
                            Outstanding
                          </div>
                          <div class="text-base sm:text-lg font-bold text-base-content">
                            {{ selectedCustomer()!.outstandingAmount | number: '1.0-0' }}
                          </div>
                        </div>
                        <div class="bg-base-300 rounded-xl p-3 text-center">
                          <div class="text-xs text-base-content/60 uppercase tracking-wide">
                            Available
                          </div>
                          <div class="text-base sm:text-lg font-bold text-success">
                            {{ selectedCustomer()!.availableCredit | number: '1.0-0' }}
                          </div>
                        </div>
                      </div>

                      @if (!selectedCustomer()!.isCreditApproved) {
                        <div class="alert alert-warning">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span class="text-sm">Pending credit approval</span>
                        </div>
                      }

                      @if (selectedCustomer()!.availableCredit < total()) {
                        <div class="alert alert-error">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span class="text-sm"
                            >Insufficient credit. Available
                            {{ selectedCustomer()!.availableCredit | number: '1.0-0' }}.</span
                          >
                        </div>
                      }

                      <!-- Order Summary -->
                      <div class="bg-base-200 rounded-xl p-4 sm:p-6">
                        <div class="flex justify-between items-center mb-2">
                          <span class="text-xs sm:text-sm text-base-content/60">Items</span>
                          <span class="font-semibold text-base sm:text-lg">{{ itemCount() }}</span>
                        </div>
                        <div class="divider my-2"></div>
                        <div class="flex justify-between items-center">
                          <span class="font-bold text-base sm:text-xl">Total Due</span>
                          <span class="text-2xl sm:text-3xl font-bold text-warning text-tabular">
                            {{ currencyService.format(total()) }}
                          </span>
                        </div>
                      </div>

                      <button
                        class="btn btn-warning btn-md sm:btn-lg w-full hover:scale-105 active:scale-95 transition-transform min-h-[44px]"
                        (click)="onCompleteCredit()"
                        [disabled]="isProcessing() || !canCompleteCredit()"
                      >
                        @if (isProcessing()) {
                          <span class="loading loading-spinner"></span>
                        } @else {
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        }
                        Create Credit Sale
                      </button>
                    </div>
                  }
                </div>
              }

              <!-- Payment Selection (Default) - Step 1: Summary, Step 2: Payment Methods -->
              @if (!checkoutType() && !showSuccessAnimation()) {
                <div class="space-y-3 animate-in slide-in-from-bottom-2 duration-300">
                  <!-- Step 1: Order Summary (Read-Only) -->
                  <div
                    class="bg-base-200 rounded-xl p-3 sm:p-4 animate-in slide-in-from-bottom-2 duration-300"
                  >
                    <div class="flex justify-between items-center mb-2">
                      <span class="text-xs sm:text-sm text-base-content/60">Items</span>
                      <span class="font-semibold text-sm sm:text-base">{{ itemCount() }}</span>
                    </div>
                    <div class="divider my-2"></div>
                    <div class="flex justify-between items-center">
                      <span class="font-bold text-base sm:text-lg">Total</span>
                      <span class="text-xl sm:text-2xl font-bold text-primary text-tabular">
                        {{ currencyService.format(total()) }}
                      </span>
                    </div>
                  </div>

                  <!-- Step 2: Payment Method Selection -->
                  <div class="space-y-3 animate-in slide-in-from-bottom-2 duration-300 delay-100">
                    <!-- Credit Button (Large, Isolated, Above Grid) -->
                    <button
                      class="btn btn-warning btn-lg w-full flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-transform min-h-[52px]"
                      (click)="selectCredit.emit()"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span class="font-bold text-base sm:text-lg">Credit Sale</span>
                    </button>

                    <!-- Cash Payment Methods Grid -->
                    @if (paymentMethodsError()) {
                      <div class="alert alert-error animate-in slide-in-from-top-2 duration-300">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <div class="text-sm">
                          <p class="font-semibold">Payment Methods Not Available</p>
                          <p class="mt-1">{{ paymentMethodsError() }}</p>
                        </div>
                      </div>
                    } @else {
                      <div
                        class="grid grid-cols-2 gap-2 sm:gap-3 animate-in slide-in-from-bottom-2 duration-300 delay-200"
                      >
                        @for (method of paymentMethods(); track method.id; let i = $index) {
                          <button
                            class="card hover:bg-base-200 border-2 transition-all duration-300 p-3 sm:p-4 hover:scale-105 active:scale-95 min-h-[44px] touch-manipulation"
                            [class.border-success]="selectedPaymentMethod() === method.code"
                            [class.bg-success/10]="selectedPaymentMethod() === method.code"
                            [class.border-base-300]="selectedPaymentMethod() !== method.code"
                            [class.ring-2]="selectedPaymentMethod() === method.code"
                            [class.ring-success]="selectedPaymentMethod() === method.code"
                            [class.ring-opacity-50]="selectedPaymentMethod() === method.code"
                            (click)="onPaymentMethodSelect(method.code)"
                            [style.animation-delay]="i * 50 + 'ms'"
                          >
                            <div class="flex flex-col items-center gap-2">
                              <div
                                class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
                                [class.bg-success/20]="selectedPaymentMethod() === method.code"
                                [class.bg-base-200]="selectedPaymentMethod() !== method.code"
                                [class.scale-110]="selectedPaymentMethod() === method.code"
                              >
                                @if (method.customFields?.imageAsset?.preview) {
                                  <img
                                    [src]="method.customFields?.imageAsset?.preview"
                                    [alt]="method.name"
                                    class="w-6 h-6 object-contain"
                                  />
                                } @else {
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-5 w-5 transition-colors duration-300"
                                    [class.text-success]="selectedPaymentMethod() === method.code"
                                    [class.text-base-content/60]="
                                      selectedPaymentMethod() !== method.code
                                    "
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                      stroke-width="2"
                                      d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                                    />
                                  </svg>
                                }
                              </div>
                              <span
                                class="font-semibold text-xs sm:text-sm text-center leading-tight"
                                >{{ method.name }}</span
                              >
                            </div>
                          </button>
                        }
                      </div>

                      <!-- Confirmation after cash method selection -->
                      @if (selectedPaymentMethod()) {
                        <div
                          class="space-y-3 animate-in slide-in-from-bottom-2 duration-300 delay-300"
                        >
                          <!-- Optional Customer Selection (Collapsible/Minimal) -->
                          @if (!selectedCustomerForCash()) {
                            <details class="collapse collapse-arrow bg-base-200 rounded-lg">
                              <summary
                                class="collapse-title text-xs sm:text-sm font-medium py-2 min-h-0"
                              >
                                Link Customer (Optional)
                              </summary>
                              <div class="collapse-content p-0 pt-2">
                                <app-customer-selector
                                  [selectedCustomer]="selectedCustomerForCash()"
                                  [searchResults]="customerSearchResultsForCash()"
                                  [isSearching]="isSearchingCustomersForCash()"
                                  [isCreating]="isProcessing()"
                                  (searchTermChange)="customerSearchForCash.emit($event)"
                                  (customerSelect)="customerSelectForCash.emit($event)"
                                  (customerCreate)="customerCreateForCash.emit($event)"
                                />
                              </div>
                            </details>
                          } @else {
                            <div
                              class="flex items-center justify-between bg-success/10 rounded-lg p-2 px-3"
                            >
                              <div class="flex items-center gap-2">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-4 w-4 text-success"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                                <span class="text-xs sm:text-sm text-success"
                                  >Linked to {{ selectedCustomerForCash()!.name }}</span
                                >
                              </div>
                              <button
                                class="btn btn-ghost btn-xs btn-circle"
                                (click)="customerSelectForCash.emit(null)"
                                aria-label="Remove customer"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-3 w-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </div>
                          }

                          <!-- Compact Order Summary -->
                          <div class="bg-base-200 rounded-xl p-3 sm:p-4">
                            <div class="flex justify-between items-center mb-2">
                              <span class="text-xs sm:text-sm text-base-content/60">Items</span>
                              <span class="font-semibold text-sm sm:text-base">{{
                                itemCount()
                              }}</span>
                            </div>
                            <div class="flex justify-between items-center mb-2">
                              <span class="text-xs sm:text-sm text-base-content/60">Payment</span>
                              <span class="badge badge-success badge-xs sm:badge-sm">{{
                                getSelectedPaymentMethodName()
                              }}</span>
                            </div>
                            <div class="divider my-2"></div>
                            <div class="flex justify-between items-center">
                              <span class="font-bold text-base sm:text-lg">Total</span>
                              <span class="text-xl sm:text-2xl font-bold text-success text-tabular">
                                {{ currencyService.format(total()) }}
                              </span>
                            </div>
                          </div>

                          <button
                            class="btn btn-success btn-md sm:btn-lg w-full hover:scale-105 active:scale-95 transition-transform min-h-[44px]"
                            (click)="onCompleteCash()"
                            [disabled]="isProcessing()"
                          >
                            @if (isProcessing()) {
                              <span class="loading loading-spinner"></span>
                            } @else {
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            }
                            Complete Sale
                          </button>
                        </div>
                      }
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }
        <div class="modal-backdrop" (click)="closeModal.emit()"></div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutModalComponent implements OnInit, OnDestroy {
  readonly currencyService = inject(CurrencyService);
  readonly paymentMethodService = inject(PaymentMethodService);

  readonly isOpen = input.required<boolean>();
  readonly checkoutType = input.required<CheckoutType>();
  readonly itemCount = input.required<number>();
  readonly total = input.required<number>();
  readonly error = input<string | null>(null);
  readonly isProcessing = input<boolean>(false);
  readonly cashierFlowEnabled = input<boolean>(false);

  // Credit sale inputs
  readonly selectedCustomer = input<Customer | null>(null);
  readonly customerSearchResults = input<Customer[]>([]);
  readonly isSearchingCustomers = input<boolean>(false);

  // Cash sale inputs
  readonly selectedPaymentMethod = input<PaymentMethodCode | null>(null);
  readonly selectedCustomerForCash = input<Customer | null>(null);
  readonly customerSearchResultsForCash = input<Customer[]>([]);
  readonly isSearchingCustomersForCash = input<boolean>(false);

  // Outputs
  readonly completeCashier = output<void>();
  readonly completeCredit = output<void>();
  readonly completeCash = output<void>();
  readonly customerSearch = output<string>();
  readonly customerSelect = output<Customer | null>();
  readonly customerSearchForCash = output<string>();
  readonly customerSelectForCash = output<Customer | null>();
  readonly customerCreate = output<{ name: string; phone: string; email?: string }>();
  readonly customerCreateForCash = output<{ name: string; phone: string; email?: string }>();
  readonly paymentMethodSelect = output<PaymentMethodCode>();
  readonly closeModal = output<void>();

  // Payment selection outputs
  readonly selectCredit = output<void>();
  readonly selectCash = output<void>();
  readonly selectCashier = output<void>();

  // Dynamic payment methods
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly paymentMethodsError = signal<string | null>(null);
  readonly showSuccessAnimation = signal<boolean>(false);
  readonly confirmedAmount = signal<number | null>(null);
  readonly confirmedPaymentMethod = signal<string | null>(null);
  readonly animatedAmount = signal<number>(0);
  readonly particleCount = 25;
  private amountAnimationInterval: ReturnType<typeof setInterval> | null = null;

  readonly canCompleteCredit = computed(() => {
    const customer = this.selectedCustomer();
    if (!customer) {
      return false;
    }
    if (!customer.isCreditApproved) {
      return false;
    }
    return customer.availableCredit >= this.total();
  });

  constructor() {
    // Reset success animation state when modal closes
    effect(() => {
      if (!this.isOpen()) {
        this.resetSuccessState();
      }
    });
  }

  async ngOnInit() {
    try {
      const methods = await this.paymentMethodService.getPaymentMethods();
      this.paymentMethods.set(methods);
      this.paymentMethodsError.set(null);
    } catch (error) {
      console.error('Failed to load payment methods:', error);
      this.paymentMethodsError.set(
        error instanceof Error ? error.message : 'Failed to load payment methods',
      );
      this.paymentMethods.set([]);
    }
  }

  ngOnDestroy(): void {
    this.resetSuccessState();
  }

  private resetSuccessState(): void {
    // Clear any running intervals
    if (this.amountAnimationInterval) {
      clearInterval(this.amountAnimationInterval);
      this.amountAnimationInterval = null;
    }

    // Reset all success-related state
    this.showSuccessAnimation.set(false);
    this.confirmedAmount.set(null);
    this.confirmedPaymentMethod.set(null);
    this.animatedAmount.set(0);
  }

  getSelectedPaymentMethodName(): string {
    const selectedCode = this.selectedPaymentMethod();
    if (!selectedCode) return '';

    const method = this.paymentMethods().find((m) => m.code === selectedCode);
    return method?.name || selectedCode;
  }

  onPaymentMethodSelect(code: string): void {
    this.paymentMethodSelect.emit(code as PaymentMethodCode);
  }

  getParticleArray(): number[] {
    return Array.from({ length: this.particleCount }, (_, i) => i + 1);
  }

  private animateAmount(targetAmount: number): void {
    // Clear any existing interval
    if (this.amountAnimationInterval) {
      clearInterval(this.amountAnimationInterval);
    }

    const duration = 600; // 600ms counting animation (reduced from 800ms)
    const steps = 25; // Fewer steps for smoother, faster animation
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

  onCompleteCash(): void {
    const amount = this.total();
    this.confirmedAmount.set(amount);
    this.confirmedPaymentMethod.set(this.getSelectedPaymentMethodName());
    this.animatedAmount.set(0);
    this.showSuccessAnimation.set(true);
    setTimeout(() => this.animateAmount(amount), 850); // Start counting when amount fades in (0.85s)
    this.completeCash.emit();
  }

  onCompleteCredit(): void {
    const amount = this.total();
    this.confirmedAmount.set(amount);
    this.confirmedPaymentMethod.set('Credit Sale');
    this.animatedAmount.set(0);
    this.showSuccessAnimation.set(true);
    setTimeout(() => this.animateAmount(amount), 850);
    this.completeCredit.emit();
  }

  onCompleteCashier(): void {
    const amount = this.total();
    this.confirmedAmount.set(amount);
    this.confirmedPaymentMethod.set('Cashier');
    this.animatedAmount.set(0);
    this.showSuccessAnimation.set(true);
    setTimeout(() => this.animateAmount(amount), 850);
    this.completeCashier.emit();
  }
}
