import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';

import { PUBLIC_STOREFRONTS } from '../graphql/operations.graphql';
import { ApolloService } from '../services/apollo.service';
import { SeoService } from '../services/seo.service';
import { baseDomain, isLocalHost } from '../utils/storefront-host.util';
import { DukarunMarkComponent } from './dukarun-mark.component';
import { StoreAvatarComponent } from './store-avatar.component';

interface StoreListItem {
  name: string;
  slug: string;
  logoUrl: string | null;
}

/**
 * Discovery directory shown when the app loads with no merchant subdomain (localhost dev, or the
 * apex). Lists all browsable public storefronts and links to each. On localhost each link uses the
 * `?store=<slug>` dev override (there are no real subdomains); in production it links to the
 * merchant's subdomain.
 */
@Component({
  selector: 'app-store-directory',
  standalone: true,
  imports: [DukarunMarkComponent, StoreAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto w-full max-w-5xl px-4 py-8">
      <header class="mb-8 flex flex-col gap-4">
        <div class="flex items-center gap-2.5">
          <app-dukarun-mark cls="h-8 w-auto" />
          <span class="text-xl font-extrabold tracking-tight">Dukarun</span>
        </div>
        <div>
          <h1 class="text-2xl font-bold sm:text-3xl">Browse stores</h1>
          <p class="mt-1 text-base-content/70">Discover shops powered by Dukarun.</p>
        </div>
      </header>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <span class="loading loading-spinner loading-md text-primary"></span>
        </div>
      } @else if (stores().length === 0) {
        <p class="py-16 text-center text-base-content/60">No public stores are available yet.</p>
      } @else {
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          @for (s of stores(); track s.slug) {
            <a
              [href]="storeUrl(s.slug)"
              class="flex items-center gap-3 rounded-box border border-base-300 bg-base-100 p-4 transition-shadow hover:shadow-md"
            >
              <app-store-avatar [name]="s.name" [logoUrl]="s.logoUrl" boxClass="h-12 w-12 rounded-box shrink-0" />
              <span class="font-semibold">{{ s.name }}</span>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class StoreDirectoryComponent implements OnInit {
  private readonly apollo = inject(ApolloService);
  private readonly seo = inject(SeoService);

  readonly stores = signal<StoreListItem[]>([]);
  readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    this.seo.setPage({ title: 'Browse stores', noindex: true });
    try {
      const res = await this.apollo.getClient().query({
        query: PUBLIC_STOREFRONTS,
        fetchPolicy: 'network-only',
      });
      this.stores.set(
        (res.data?.publicStorefronts ?? []).map(s => ({
          name: s.name,
          slug: s.slug,
          logoUrl: s.logo?.preview ?? null,
        }))
      );
    } finally {
      this.loading.set(false);
    }
  }

  storeUrl(slug: string): string {
    if (typeof window === 'undefined') return '#';
    const host = window.location.hostname;
    if (isLocalHost(host)) {
      // Local dev: no real subdomains — use the ?store override (full reload re-resolves the store).
      return `/?store=${encodeURIComponent(slug)}`;
    }
    return `${window.location.protocol}//${slug}.${baseDomain(host)}`;
  }
}
