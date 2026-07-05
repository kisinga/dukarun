import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The Dukarun mark, backed by the canonical brand asset. */
@Component({
  selector: 'app-dukarun-mark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img src="/assets/logo/dukarun-icon-dark.svg" alt="Dukarun" [attr.class]="cls()" />
  `,
})
export class DukarunMarkComponent {
  readonly cls = input('h-6 w-auto');
}
