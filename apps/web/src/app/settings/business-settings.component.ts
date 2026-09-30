import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '../shared/ui/button.component';
import { ShopProfileComponent } from './shop-profile.component';
import { ShopAddressComponent } from './shop-address.component';

@Component({
  selector: 'app-business-settings',
  imports: [RouterLink, ButtonComponent, ShopProfileComponent, ShopAddressComponent],
  template: `
    <div class="space-y-4">
      <section class="card bg-base-100">
        <div class="card-body flex-row flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 class="section-title">Shop setup</h2>
            <p class="type-caption">Review the basics, then continue your first business cycle.</p>
          </div>
          <a appButton variant="outline" routerLink="/shop-setup">Continue setup</a>
        </div>
      </section>
      <app-shop-profile />
      <app-shop-address />
      <section class="card bg-base-100">
        <div class="card-body flex-row flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 class="section-title">Document designs</h2>
            <p class="type-caption">
              Classic, Compact or Modern. Your shop details are shared across all documents.
            </p>
          </div>
          <a appButton variant="outline" routerLink="/settings/documents"> Customize documents </a>
        </div>
      </section>
    </div>
  `,
})
export class BusinessSettingsComponent {}
