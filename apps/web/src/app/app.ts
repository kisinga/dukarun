import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
}
