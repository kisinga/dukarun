import { Injectable, signal } from '@angular/core';

/** Global launcher for the till-count dialog; intentionally independent of routing. */
@Injectable({ providedIn: 'root' })
export class CashierSessionDialogService {
  readonly visible = signal(false);
  readonly completed = signal(0);

  show(): void {
    this.visible.set(true);
  }

  hide(): void {
    this.visible.set(false);
  }

  markCompleted(): void {
    this.completed.update(value => value + 1);
  }
}
