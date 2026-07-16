import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Triggers opening the open/close shift modal from anywhere (e.g. navbar badge or overview). */
@Injectable({ providedIn: 'root' })
export class ShiftModalTriggerService {
  private readonly openRequested = new Subject<'open' | 'close'>();

  /** Emits when the shift modal should open in 'open' or 'close' mode. */
  readonly open$ = this.openRequested.asObservable();

  /** Request to open the modal in "close shift" mode. */
  openCloseModal(): void {
    this.openRequested.next('close');
  }

  /** Request to open the modal in "open shift" mode. */
  openOpenModal(): void {
    this.openRequested.next('open');
  }
}
