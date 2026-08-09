import { Component, OnInit } from '@angular/core';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-operational-redirect',
  template: '<p class="p-6 text-center text-sm">Opening the Dukarun app…</p>',
})
export class OperationalRedirectComponent implements OnInit {
  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    const target = new URL(
      window.location.pathname + window.location.search,
      `${environment.appPublicUrl.replace(/\/+$/, '')}/`
    );
    window.location.replace(target.toString());
  }
}
