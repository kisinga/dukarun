import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private readonly toastsSignal = signal<Toast[]>([]);
  private readonly maxToasts = 3;

  readonly toasts = this.toastsSignal.asReadonly();

  show(
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    duration: number = 5000,
  ): string {
    const id = this.generateId();
    const toast: Toast = {
      id,
      title,
      message,
      type,
      duration,
      timestamp: Date.now(),
    };

    this.toastsSignal.update((toasts) => {
      const newToasts = [toast, ...toasts];
      // Keep only the most recent toasts
      return newToasts.slice(0, this.maxToasts);
    });

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  dismiss(id: string): void {
    this.toastsSignal.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  clear(): void {
    this.toastsSignal.set([]);
  }

  private generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
