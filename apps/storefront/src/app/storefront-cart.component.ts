import { Component, input, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { StorefrontCartService, type StorefrontCartShop } from './storefront-cart.service';
import { StorefrontService } from './storefront.service';

@Component({
  selector: 'app-storefront-cart',
  imports: [NgIcon],
  template: `
    @if (!cart.isEmpty()) {
      <button
        type="button"
        class="btn btn-primary fixed right-4 bottom-4 z-40 min-h-13 rounded-full px-5 shadow-lg sm:right-6 sm:bottom-6"
        (click)="open()"
      >
        <ng-icon name="heroShoppingBag" size="1.15rem" aria-hidden="true" />
        <span>Basket · {{ cart.count() }} · {{ cart.formatKes(cart.total()) }}</span>
      </button>
    }

    @if (drawerOpen()) {
      <div
        class="fixed inset-0 z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="basket-title"
      >
        <button
          type="button"
          class="absolute inset-0 bg-black/35"
          aria-label="Close basket"
          (click)="close()"
        ></button>
        <aside
          class="absolute right-0 bottom-0 left-0 max-h-[88vh] overflow-hidden rounded-t-3xl border border-base-300 bg-base-100 shadow-2xl sm:top-0 sm:left-auto sm:h-full sm:max-h-none sm:w-[26rem] sm:rounded-none"
        >
          <div class="flex h-full flex-col">
            <header class="flex items-start gap-3 border-b border-base-300 px-5 py-4">
              <div class="min-w-0 flex-1">
                <p id="basket-title" class="text-lg font-bold">Basket</p>
                <p class="mt-0.5 text-sm text-base-content/55">
                  {{ shop().name }} will confirm availability on WhatsApp.
                </p>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-square min-h-11"
                aria-label="Close basket"
                (click)="close()"
              >
                <ng-icon name="heroXMark" size="1.2rem" aria-hidden="true" />
              </button>
            </header>

            <div class="flex-1 overflow-y-auto px-5 py-4">
              @if (cart.lines().length) {
                <div class="flex flex-col gap-3">
                  @for (line of cart.lines(); track line.variantId) {
                    <article
                      class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-2xl border border-base-300 p-3"
                    >
                      <div class="aspect-square overflow-hidden rounded-xl bg-[#eee8df]">
                        @if (imageUrl(line.imagePath); as image) {
                          <img
                            [src]="image"
                            [alt]="line.productName"
                            class="h-full w-full object-cover"
                          />
                        } @else {
                          <div
                            class="grid h-full place-content-center text-center text-[0.62rem] font-semibold tracking-wider text-base-content/30 uppercase"
                          >
                            No photo
                          </div>
                        }
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-start gap-2">
                          <div class="min-w-0 flex-1">
                            <h3 class="line-clamp-2 text-sm leading-snug font-semibold">
                              {{ cart.lineLabel(line) }}
                            </h3>
                            <p class="mt-1 text-sm font-bold tabular-nums text-primary">
                              {{ cart.formatKes(line.price) }}
                            </p>
                          </div>
                          <button
                            type="button"
                            class="btn btn-ghost btn-square btn-sm text-base-content/45"
                            aria-label="Remove item"
                            (click)="cart.remove(line.variantId)"
                          >
                            <ng-icon name="heroTrash" size="1rem" aria-hidden="true" />
                          </button>
                        </div>

                        <div class="mt-3 flex items-center justify-between gap-3">
                          <div class="join">
                            <button
                              type="button"
                              class="btn join-item btn-sm min-h-10"
                              aria-label="Decrease quantity"
                              (click)="decrement(line.variantId, line.quantity)"
                            >
                              <ng-icon name="heroMinus" size="1rem" aria-hidden="true" />
                            </button>
                            <span
                              class="join-item grid min-h-10 min-w-12 place-items-center border-y border-base-300 px-3 text-sm font-semibold tabular-nums"
                              >{{ line.quantity }}</span
                            >
                            <button
                              type="button"
                              class="btn join-item btn-sm min-h-10"
                              aria-label="Increase quantity"
                              (click)="cart.setQuantity(line.variantId, line.quantity + 1)"
                            >
                              <ng-icon name="heroPlus" size="1rem" aria-hidden="true" />
                            </button>
                          </div>
                          <p class="text-sm font-semibold tabular-nums">
                            {{ cart.formatKes(line.price * line.quantity) }}
                          </p>
                        </div>
                      </div>
                    </article>
                  }
                </div>
              } @else {
                <div class="grid min-h-52 place-content-center text-center">
                  <p class="text-lg font-bold">Basket cleared</p>
                  <p class="mt-1 text-sm text-base-content/55">
                    Add another item when you're ready.
                  </p>
                </div>
              }
            </div>

            <footer class="border-t border-base-300 p-5">
              @if (cart.lines().length) {
                <div class="flex items-center justify-between gap-4">
                  <span class="text-sm text-base-content/55">Estimated total</span>
                  <strong class="text-xl tabular-nums text-primary">{{
                    cart.formatKes(cart.total())
                  }}</strong>
                </div>
                <p class="mt-2 text-xs leading-5 text-base-content/50">
                  The shop will confirm availability and final total on WhatsApp.
                </p>
                @if (cart.whatsappLink(); as href) {
                  <a
                    [href]="href"
                    target="_blank"
                    rel="noopener"
                    class="btn btn-primary mt-4 min-h-13 w-full rounded-2xl text-base"
                    >Send order on WhatsApp</a
                  >
                }
                <button
                  type="button"
                  class="btn btn-ghost mt-2 min-h-11 w-full"
                  (click)="cart.clear()"
                >
                  Clear basket
                </button>
              } @else {
                <button
                  type="button"
                  class="btn btn-primary min-h-12 w-full rounded-2xl"
                  (click)="close()"
                >
                  Keep browsing
                </button>
              }
            </footer>
          </div>
        </aside>
      </div>
    }
  `,
})
export class StorefrontCartComponent {
  readonly shop = input.required<StorefrontCartShop>();
  protected readonly drawerOpen = signal(false);

  constructor(
    protected readonly cart: StorefrontCartService,
    private readonly storefront: StorefrontService
  ) {}

  protected open(): void {
    this.drawerOpen.set(true);
  }

  protected close(): void {
    this.drawerOpen.set(false);
  }

  protected decrement(variantId: string, quantity: number): void {
    if (quantity <= 1) this.cart.remove(variantId);
    else this.cart.setQuantity(variantId, quantity - 1);
  }

  protected imageUrl(path: string | null): string | null {
    return this.storefront.imageUrl(path);
  }
}
