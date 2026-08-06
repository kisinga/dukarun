import { Component, DestroyRef, inject, isDevMode } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    if (isDevMode() || !this.updates.isEnabled) return;

    this.updates.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event.type === 'VERSION_READY') window.location.reload();
    });

    this.updates.unrecoverable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => window.location.reload());
  }
}
