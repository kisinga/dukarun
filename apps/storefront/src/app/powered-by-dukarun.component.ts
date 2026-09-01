import { Component, input } from '@angular/core';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-powered-by-dukarun',
  template: `
    <a
      [href]="homepageUrl"
      [class]="linkClass()"
      aria-label="Powered by Dukarun — visit the Dukarun homepage"
    >
      <img
        src="/assets/logo/dukarun-icon-dark.svg"
        width="12"
        height="13"
        alt=""
        aria-hidden="true"
        [class]="imageClass()"
      />
      <span>Powered by Dukarun</span>
    </a>
  `,
})
export class PoweredByDukarunComponent {
  readonly appearance = input<'screen' | 'print'>('screen');
  protected readonly homepageUrl = environment.sitePublicUrl.replace(/\/+$/, '');

  protected linkClass(): string {
    return this.appearance() === 'print'
      ? 'inline-flex items-center gap-1 text-[9px] tracking-wide text-neutral-600'
      : 'inline-flex items-center gap-1.5 rounded-field text-base-content/55 transition hover:text-base-content/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  }

  protected imageClass(): string {
    return this.appearance() === 'print'
      ? 'h-2.5 w-[9.23px] shrink-0 object-contain'
      : 'h-[13px] w-3 opacity-75';
  }
}
