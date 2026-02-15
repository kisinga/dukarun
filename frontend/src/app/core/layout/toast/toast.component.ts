import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast toast-top toast-end z-50">
      @for (toast of toasts(); track toast.id) {
        <div class="alert anim-slide-in-right" [class]="getAlertClass(toast.type)">
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0">
              <span class="text-lg">{{ getIcon(toast.type) }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="font-semibold text-sm">{{ toast.title }}</h4>
              <p class="text-sm opacity-90 mt-1">{{ toast.message }}</p>
            </div>
            <button
              class="btn btn-sm btn-circle btn-ghost flex-shrink-0"
              (click)="onDismiss(toast.id)"
              aria-label="Close notification"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ToastComponent {
  toasts = input.required<
    Array<{
      id: string;
      title: string;
      message: string;
      type: 'info' | 'success' | 'warning' | 'error';
      duration: number;
      timestamp: number;
    }>
  >();

  private readonly toastService = inject(ToastService);

  onDismiss(id: string): void {
    this.toastService.dismiss(id);
  }

  getAlertClass(type: string): string {
    switch (type) {
      case 'success':
        return 'alert-success';
      case 'warning':
        return 'alert-warning';
      case 'error':
        return 'alert-error';
      default:
        return 'alert-info';
    }
  }

  getIcon(type: string): string {
    switch (type) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return 'ℹ️';
    }
  }
}
