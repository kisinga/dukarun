import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteSeoService } from './core/site-seo.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: ':host { display: block; min-height: 100vh; }',
})
export class App {
  private readonly seo = inject(SiteSeoService);
}
