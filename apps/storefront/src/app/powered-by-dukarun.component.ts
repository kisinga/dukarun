import { Component } from '@angular/core';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-powered-by-dukarun',
  template: `
    <a
      [href]="homepageUrl"
      class="inline-flex items-center gap-1.5 rounded-field text-base-content/55 transition hover:text-base-content/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label="Powered by Dukarun — visit the Dukarun homepage"
    >
      <img
        src="/assets/logo/dukarun-icon-dark.svg"
        width="12"
        height="13"
        alt=""
        aria-hidden="true"
        class="h-[13px] w-3 opacity-75"
      />
      <span>Powered by Dukarun</span>
    </a>
  `,
})
export class PoweredByDukarunComponent {
  protected readonly homepageUrl = environment.sitePublicUrl.replace(/\/+$/, '');
}
