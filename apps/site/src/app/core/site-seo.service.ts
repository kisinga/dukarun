import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, startWith } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SiteSeoService {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  constructor() {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        startWith(null)
      )
      .subscribe(() => this.update());
  }

  private update(): void {
    let leaf = this.route;
    while (leaf.firstChild) leaf = leaf.firstChild;
    const description = leaf.snapshot.data['description'] as string | undefined;
    if (description) this.meta.updateTag({ name: 'description', content: description });
    const url = new URL(
      this.router.url.split('?')[0].split('#')[0] || '/',
      environment.sitePublicUrl
    );
    let canonical = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }
    canonical.href = url.toString();
  }
}
