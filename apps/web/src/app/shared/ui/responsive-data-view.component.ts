import { Component } from '@angular/core';

/** Pairs the required mobile representation with its dense desktop table. */
@Component({
  selector: 'app-responsive-data-view',
  host: { class: 'block' },
  template: `
    <div class="lg:hidden"><ng-content select="[mobileData]" /></div>
    <div class="hidden lg:block"><ng-content select="[desktopData]" /></div>
  `,
})
export class ResponsiveDataViewComponent {}
