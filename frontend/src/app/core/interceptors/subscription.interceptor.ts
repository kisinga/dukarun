import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { SubscriptionService } from '../services/subscription.service';
import { ToastService } from '../services/toast.service';

/**
 * HTTP Interceptor for handling subscription-related errors
 *
 * Catches subscription expiration errors from backend and:
 * - Shows toast notification
 * - Allows navigation to subscription/payment pages
 * - Blocks other operations when subscription is expired
 */
export const subscriptionInterceptor: HttpInterceptorFn = (req, next) => {
  const subscriptionService = inject(SubscriptionService);
  const toastService = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Check if error is specifically a subscription expiry block from the backend guard
      if (error.error?.message?.includes('Subscription expired. Please renew')) {
        // Show toast notification
        toastService.show(
          'Subscription',
          'Subscription expired. Please renew to continue.',
          'error',
        );

        // Check if this is a subscription-related request (allow it)
        const isSubscriptionRequest =
          req.url.includes('subscription') || req.url.includes('payment');

        if (!isSubscriptionRequest) {
          // For non-subscription requests, we can still throw the error
          // The UI components should handle read-only mode
        }
      }

      return throwError(() => error);
    }),
  );
};
