import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-storefront-api-docs',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="border-b border-base-300/60 bg-base-200/60 py-16 sm:py-24">
      <div class="mkt-container max-w-5xl">
        <a
          routerLink="/"
          class="inline-flex min-h-11 items-center text-sm font-semibold text-base-content/60 hover:text-primary"
        >
          <span aria-hidden="true">←</span>
          <span class="ml-2">Dukarun</span>
        </a>
        <span class="mkt-eyebrow mt-4 block">Developer API</span>
        <h1 class="mkt-h1 mt-3 max-w-4xl">Put a Dukarun catalogue on your own website.</h1>
        <p class="mkt-lead mt-5 max-w-3xl">
          Read a public storefront's products, variants, prices, categories, images, and
          availability. No API key or SDK is required.
        </p>
        <div class="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href="/developers/storefront/reference/" class="btn btn-primary min-h-11">
            Open API reference
          </a>
          <a href="/openapi/storefront-v1.yaml" class="btn btn-outline min-h-11">
            Download OpenAPI
          </a>
        </div>
      </div>
    </section>

    <section class="bg-base-100 py-14 sm:py-20">
      <div class="mkt-container grid max-w-5xl gap-12 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <main class="min-w-0 space-y-14">
          <section aria-labelledby="quick-start">
            <span class="mkt-eyebrow">Quick start</span>
            <h2 id="quick-start" class="mkt-h2 mt-2">Fetch one catalogue page</h2>
            <p class="mt-4 leading-relaxed text-base-content/70">
              Replace <code>your-shop</code> with the slug shown in the storefront URL. The API is
              public and read-only, so the request needs no authorization header.
            </p>
            <pre
              class="mt-6 overflow-x-auto rounded-box bg-neutral p-5 text-sm leading-6 text-neutral-content"
            ><code>{{ curlExample }}</code></pre>
          </section>

          <section aria-labelledby="endpoints">
            <span class="mkt-eyebrow">Two endpoints</span>
            <h2 id="endpoints" class="mkt-h2 mt-2">Enough to render a product catalogue</h2>
            <div class="mt-6 overflow-hidden rounded-box border border-base-300/70">
              <div
                class="border-b border-base-300/60 p-5 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-5"
              >
                <code class="text-sm font-semibold text-primary"
                  >GET /storefronts/{{ '{' }}slug{{ '}' }}</code
                >
                <p class="mb-0 mt-2 text-sm text-base-content/70 sm:mt-0">
                  Store identity, categories, and paged product summaries. Filter with
                  <code>search</code> or <code>category</code>.
                </p>
              </div>
              <div class="p-5 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-5">
                <code class="text-sm font-semibold text-primary"
                  >GET /storefronts/{{ '{' }}slug{{ '}' }}/products/…</code
                >
                <p class="mb-0 mt-2 text-sm text-base-content/70 sm:mt-0">
                  One product with its active variants, SKUs, prices, and availability.
                </p>
              </div>
            </div>
          </section>

          <section aria-labelledby="browser-example">
            <span class="mkt-eyebrow">Browser example</span>
            <h2 id="browser-example" class="mkt-h2 mt-2">Use normal fetch</h2>
            <p class="mt-4 leading-relaxed text-base-content/70">
              Cross-origin requests are allowed. Check <code>response.ok</code>, then render the
              products returned in <code>body.data.products</code>.
            </p>
            <pre
              class="mt-6 overflow-x-auto rounded-box bg-neutral p-5 text-sm leading-6 text-neutral-content"
            ><code>{{ javascriptExample }}</code></pre>
          </section>

          <section aria-labelledby="rules">
            <span class="mkt-eyebrow">Contract rules</span>
            <h2 id="rules" class="mkt-h2 mt-2">Small, stable, and safe by default</h2>
            <ul class="mt-6 grid gap-4 text-sm leading-relaxed text-base-content/75 sm:grid-cols-2">
              <li class="mkt-card p-5">
                <strong class="block text-base-content">Prices</strong>
                Integer amounts are whole Kenyan shillings. Currency is always <code>KES</code> in
                v1.
              </li>
              <li class="mkt-card p-5">
                <strong class="block text-base-content">Availability</strong>
                A boolean says whether an item can be sold. Exact stock quantities are private.
              </li>
              <li class="mkt-card p-5">
                <strong class="block text-base-content">Pagination</strong>
                <code>limit</code> defaults to 12 and can be at most 48. Continue while
                <code>has_more</code> is true.
              </li>
              <li class="mkt-card p-5">
                <strong class="block text-base-content">Errors</strong>
                Every error has a code, message, and request ID. After a <code>429</code>, wait for
                the <code>Retry-After</code> delay.
              </li>
            </ul>
          </section>

          <aside class="rounded-box border border-info/30 bg-info/10 p-6">
            <h2 class="text-lg font-semibold">Current scope</h2>
            <p class="mb-0 mt-2 text-sm leading-relaxed text-base-content/75">
              This API reads public catalogue data. Carts, orders, checkout, online payments,
              webhooks, and private inventory data are not part of v1.
            </p>
          </aside>
        </main>

        <aside class="hidden lg:block">
          <nav
            class="sticky top-24 rounded-box border border-base-300/70 bg-base-200/45 p-5 text-sm"
          >
            <p class="font-semibold">Storefront API v1</p>
            <p class="mt-1 text-xs text-base-content/55">Base URL</p>
            <code class="mt-1 block break-all text-xs">https://store.dukarun.com/api/v1</code>
            <div class="mt-5 flex flex-col gap-3 border-t border-base-300/60 pt-5">
              <a href="#quick-start" class="hover:text-primary">Quick start</a>
              <a href="#endpoints" class="hover:text-primary">Endpoints</a>
              <a href="#browser-example" class="hover:text-primary">Browser example</a>
              <a href="#rules" class="hover:text-primary">Contract rules</a>
              <a href="/developers/storefront/reference/" class="font-semibold text-primary">
                Full reference →
              </a>
            </div>
          </nav>
        </aside>
      </div>
    </section>
  `,
})
export class StorefrontApiComponent {
  protected readonly curlExample = `curl \\
  'https://store.dukarun.com/api/v1/storefronts/your-shop?limit=12'`;

  protected readonly javascriptExample = `const response = await fetch(
  'https://store.dukarun.com/api/v1/storefronts/your-shop?limit=12'
);

if (!response.ok) throw new Error(\`API failed: \${response.status}\`);

const body = await response.json();
for (const product of body.data.products) {
  console.log(product.name, product.price.min, product.available);
}`;
}
