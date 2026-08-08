import { Component, effect, inject, isDevMode } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { toSignal } from '@angular/core/rxjs-interop';
import { SyncService } from './pos/offline/sync.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }
    `,
  ],
})
export class App {
  // Instantiate the sync engine at app start (triggers: online event,
  // app start, 30s interval). Screens read its queue state signals.
  private readonly sync = inject(SyncService);
  private readonly updates = inject(SwUpdate);

  constructor() {
    if (isDevMode() || !this.updates.isEnabled) return;

    const versionEvent = toSignal(this.updates.versionUpdates, { initialValue: null });
    const unrecoverable = toSignal(this.updates.unrecoverable, { initialValue: null });
    effect(() => {
      const event = versionEvent();
      if (event?.type === 'VERSION_READY') window.location.reload();
    });
    effect(() => {
      if (unrecoverable()) window.location.reload();
    });
  }
}
