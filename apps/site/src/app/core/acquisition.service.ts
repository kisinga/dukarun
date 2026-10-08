import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  acquisitionSource,
  enquiryPath,
  type EnquiryIntent,
} from '../../../../../packages/public-acquisition';

/** Reads campaign context at activation time, including client-side navigations. */
@Injectable({ providedIn: 'root' })
export class AcquisitionService {
  private readonly router = inject(Router);

  enquiryUrl(intent: EnquiryIntent = 'demo', from?: string): string {
    const url = new URL(this.router.url, 'https://site.invalid');
    const source = acquisitionSource(url.searchParams, from ?? url.pathname);
    if (from) source.from = from;
    return enquiryPath(intent, source);
  }
}
