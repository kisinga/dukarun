import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

/** One sellable item in the looping demo. Kenyan duka staples so it reads true. */
interface DemoProduct {
  name: string;
  size: string;
  /** Price in KES (whole shillings). */
  price: number;
  emoji: string;
  /** Opening stock count, shown decrementing on the dashboard. */
  stock: number;
}

const PRODUCTS: DemoProduct[] = [
  { name: 'Maziwa', size: '500 ml', price: 60, emoji: '🥛', stock: 24 },
  { name: 'Sukari', size: '1 kg', price: 180, emoji: '🍬', stock: 6 },
  { name: 'Mkate', size: '400 g', price: 65, emoji: '🍞', stock: 13 },
  { name: 'Soda', size: '500 ml', price: 80, emoji: '🥤', stock: 31 },
  { name: 'Unga', size: '2 kg', price: 210, emoji: '🌽', stock: 9 },
];

/** The four beats of one sale. The loop steps through these, then the next item. */
type Phase = 'scan' | 'found' | 'added' | 'paid';
const SEQUENCE: readonly Phase[] = ['scan', 'found', 'added', 'paid'] as const;

/** Below this on-hand count, a stock row flips to the amber "Low" warning. */
const LOW_STOCK = 5;

/**
 * The homepage hero render — an animated stand-in for the live product, not a
 * screenshot. A phone runs the core "point and sell" loop on the left; a compact
 * dashboard on the right reacts the instant each sale is paid (sales tick up,
 * items sold +1, the sparkline nudges, the sold item's stock drops and flashes
 * amber when low). An orange pulse links the two on payment, so the story —
 * sell → stock → money, all in one tap — reads without a word of copy.
 *
 * Built the cheap, resilient way for low-end phones in daylight:
 *  - signals + a single interval (no rAF, no heavy compositing);
 *  - started from `afterNextRender`, so SSR/prerender ships a meaningful static
 *    first frame (a found product + a populated dashboard) and motion begins in
 *    the browser only;
 *  - honours `prefers-reduced-motion`: no loop, and the keyframes below are
 *    disabled, leaving that same readable static frame.
 *
 * Light page, warm-dark stage: the page stays bright and high-contrast for sunlit
 * shops; the render alone sits on a deep stone panel with a primary glow so it is
 * the unmistakable focal point. Contrast as hierarchy, not a site-wide theme.
 */
@Component({
  selector: 'app-pos-demo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-hidden': 'true' },
  styles: [
    `
      :host {
        --pos-accent: #e85d2f; /* brand primary; mirrors --color-primary */
      }

      /* opacity-only pulses — cheaper than scaling large gradients each frame */
      @keyframes pos-glow {
        0%,
        100% {
          opacity: 0.5;
        }
        50% {
          opacity: 0.85;
        }
      }
      @keyframes pos-scan {
        0% {
          transform: translateY(-120%);
        }
        100% {
          transform: translateY(220%);
        }
      }
      @keyframes pos-reticle {
        0%,
        100% {
          opacity: 0.5;
          transform: scale(0.97);
        }
        50% {
          opacity: 1;
          transform: scale(1.03);
        }
      }
      @keyframes pos-pop {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @keyframes pos-live-dot {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.35;
        }
      }
      /* the "sale" pulse travelling phone → dashboard on payment */
      @keyframes pos-wire {
        0% {
          offset-distance: 0%;
          opacity: 0;
        }
        15% {
          opacity: 1;
        }
        85% {
          opacity: 1;
        }
        100% {
          offset-distance: 100%;
          opacity: 0;
        }
      }
      @keyframes pos-bump {
        0% {
          transform: none;
        }
        35% {
          transform: translateY(-3px) scale(1.04);
        }
        100% {
          transform: none;
        }
      }

      .pos-glow {
        animation: pos-glow 5s ease-in-out infinite;
      }
      .pos-scan {
        animation: pos-scan 2.6s ease-in-out infinite;
      }
      .pos-reticle {
        animation: pos-reticle 1.6s ease-in-out infinite;
      }
      .pos-pop {
        animation: pos-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      .pos-live {
        animation: pos-live-dot 1.8s ease-in-out infinite;
      }
      .pos-bump {
        animation: pos-bump 0.6s ease-out;
      }
      .pos-wire-dot {
        offset-path: path('M 0 0 H 120');
        animation: pos-wire 1.1s ease-in-out;
      }

      @media (prefers-reduced-motion: reduce) {
        .pos-glow,
        .pos-scan,
        .pos-reticle,
        .pos-pop,
        .pos-live,
        .pos-bump,
        .pos-wire-dot {
          animation: none;
        }
        .pos-scan,
        .pos-wire-dot {
          display: none;
        }
      }
    `,
  ],
  template: `
    <!-- warm-dark focal stage (.mkt-stage recipe — shared with other showpieces) -->
    <div class="mkt-stage p-5 sm:p-7">
      <!-- ambient brand glow -->
      <div
        class="pos-glow pointer-events-none absolute -top-20 -right-10 h-72 w-72 rounded-full blur-3xl"
        style="background: radial-gradient(circle, rgba(232,93,47,0.35), transparent 70%)"
      ></div>
      <div
        class="pos-glow pointer-events-none absolute -bottom-24 -left-12 h-64 w-64 rounded-full blur-3xl"
        style="background: radial-gradient(circle, rgba(232,93,47,0.18), transparent 70%); animation-delay: -2.5s"
      ></div>

      <div class="relative grid gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:items-center">
        <!-- ───────────────────────── PHONE ───────────────────────── -->
        <div class="mx-auto w-full max-w-[260px]">
          <div class="rounded-[2rem] bg-stone-900 ring-1 ring-white/10 p-2.5 shadow-xl">
            <!-- screen -->
            <div class="relative overflow-hidden rounded-[1.5rem] bg-base-100 text-base-content">
              <!-- app top bar -->
              <div class="flex items-center justify-between px-3 py-2 border-b border-base-300/60">
                <span class="text-[11px] font-bold tracking-tight">Dukarun</span>
                <span class="inline-flex items-center gap-1 text-[9px] font-semibold text-success">
                  <span class="pos-live h-1.5 w-1.5 rounded-full bg-success"></span> Live
                </span>
              </div>

              <!-- viewfinder / product zone -->
              <div class="relative h-[176px] bg-stone-900">
                @switch (phase()) {
                  @case ('scan') {
                    <!-- camera viewfinder pointed at a label -->
                    <div class="absolute inset-0 flex items-center justify-center">
                      <span class="text-5xl opacity-40 select-none">{{ product().emoji }}</span>
                    </div>
                    <div
                      class="pos-scan absolute inset-x-6 h-10 bg-gradient-to-b from-transparent via-primary/50 to-transparent"
                    ></div>
                    <div
                      class="pos-reticle absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-xl ring-2 ring-primary/80"
                    >
                      <span
                        class="absolute -left-px -top-px h-4 w-4 rounded-tl-lg border-l-2 border-t-2 border-primary"
                      ></span>
                      <span
                        class="absolute -right-px -top-px h-4 w-4 rounded-tr-lg border-r-2 border-t-2 border-primary"
                      ></span>
                      <span
                        class="absolute -bottom-px -left-px h-4 w-4 rounded-bl-lg border-b-2 border-l-2 border-primary"
                      ></span>
                      <span
                        class="absolute -bottom-px -right-px h-4 w-4 rounded-br-lg border-b-2 border-r-2 border-primary"
                      ></span>
                    </div>
                    <span
                      class="absolute inset-x-0 bottom-3 text-center text-[10px] font-medium text-white/70"
                      >Point at any product</span
                    >
                  }
                  @default {
                    <!-- recognised product card -->
                    <div
                      class="pos-pop absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center"
                    >
                      <span class="text-4xl select-none">{{ product().emoji }}</span>
                      <span class="text-sm font-bold leading-none text-white">{{
                        product().name
                      }}</span>
                      <span class="text-[10px] text-white/50">{{ product().size }}</span>
                      <span class="mt-1 text-lg font-extrabold leading-none text-primary"
                        >KES {{ product().price }}</span
                      >
                      @if (phase() === 'found') {
                        <span
                          class="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-bold text-primary-content"
                        >
                          + Add to sale
                        </span>
                      } @else {
                        <span
                          class="mt-1.5 inline-flex items-center gap-1 rounded-full bg-success/20 px-3 py-1 text-[10px] font-bold text-success"
                        >
                          ✓ Added
                        </span>
                      }
                    </div>
                  }
                }
              </div>

              <!-- cart / pay strip -->
              <div
                class="flex items-center justify-between px-3 py-2.5 border-t border-base-300/60"
              >
                @if (phase() === 'paid') {
                  <span class="inline-flex items-center gap-1.5 text-[11px] font-bold text-success">
                    <span
                      class="grid h-4 w-4 place-items-center rounded-full bg-success text-[8px] text-success-content"
                      >✓</span
                    >
                    Paid · M-Pesa
                  </span>
                  <span class="text-[11px] font-bold tabular-nums">KES {{ product().price }}</span>
                } @else {
                  <span class="text-[10px] text-base-content/50">
                    Cart · {{ phase() === 'scan' ? 0 : 1 }} item{{ phase() === 'scan' ? 's' : '' }}
                  </span>
                  <span
                    class="rounded-lg px-2.5 py-1 text-[10px] font-bold tabular-nums"
                    [class]="
                      phase() === 'scan'
                        ? 'bg-base-200 text-base-content/40'
                        : 'bg-primary text-primary-content'
                    "
                  >
                    {{ phase() === 'scan' ? 'KES 0' : 'Charge KES ' + product().price }}
                  </span>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- ─────────────────── CONNECTOR (lg only) ─────────────────── -->
        <div
          class="pointer-events-none absolute left-[245px] top-1/2 hidden lg:block"
          aria-hidden="true"
        >
          <svg width="120" height="12" viewBox="0 0 120 12" fill="none" class="overflow-visible">
            <line
              x1="0"
              y1="6"
              x2="120"
              y2="6"
              stroke="rgba(232,93,47,0.25)"
              stroke-width="2"
              stroke-dasharray="4 4"
            />
            @if (justPaid()) {
              <circle r="4" cy="6" fill="#e85d2f" class="pos-wire-dot" />
            }
          </svg>
        </div>

        <!-- ───────────────────────── DASHBOARD ───────────────────────── -->
        <div class="grid grid-cols-2 gap-3">
          <!-- Sales today -->
          <div
            class="rounded-2xl bg-white/5 ring-1 ring-white/10 p-3.5"
            [class.pos-bump]="justPaid()"
          >
            <div class="text-[10px] uppercase tracking-wider text-white/45">Sales today</div>
            <div class="mt-1.5 text-xl font-extrabold tabular-nums text-white leading-none">
              <span class="text-sm font-bold text-white/55">KES</span> {{ salesLabel() }}
            </div>
            <div class="mt-1 text-[10px] font-semibold text-success">▲ live</div>
          </div>

          <!-- Items sold -->
          <div
            class="rounded-2xl bg-white/5 ring-1 ring-white/10 p-3.5"
            [class.pos-bump]="justPaid()"
          >
            <div class="text-[10px] uppercase tracking-wider text-white/45">Items sold</div>
            <div class="mt-1.5 text-xl font-extrabold tabular-nums text-white leading-none">
              {{ itemsSold() }}
            </div>
            <div class="mt-1 text-[10px] text-white/40">across the counter</div>
          </div>

          <!-- Sales sparkline -->
          <div class="col-span-2 rounded-2xl bg-white/5 ring-1 ring-white/10 p-3.5">
            <div class="flex items-center justify-between">
              <span class="text-[10px] uppercase tracking-wider text-white/45">This week</span>
              <span class="text-[10px] font-semibold text-white/60">Mon–Sun</span>
            </div>
            <div class="mt-2.5 flex h-12 items-end gap-1.5">
              @for (h of spark(); track $index) {
                <div
                  class="flex-1 rounded-sm bg-gradient-to-t from-primary/50 to-primary transition-[height] duration-700 ease-out"
                  [style.height.%]="h * 100"
                ></div>
              }
            </div>
          </div>

          <!-- Live stock -->
          <div class="col-span-2 rounded-2xl bg-white/5 ring-1 ring-white/10 p-3.5">
            <div class="text-[10px] uppercase tracking-wider text-white/45">Stock, updating</div>
            <div class="mt-2 space-y-1.5">
              @for (row of stockRows(); track row.name) {
                <div class="flex items-center justify-between text-[11px]">
                  <span class="flex items-center gap-1.5 text-white/70">
                    <span class="select-none">{{ row.emoji }}</span> {{ row.name }}
                  </span>
                  @if (row.qty <= lowStock) {
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[9px] font-bold text-warning"
                    >
                      {{ row.qty }} · Low
                    </span>
                  } @else {
                    <span class="font-semibold tabular-nums text-white/80">{{ row.qty }}</span>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PosDemoComponent {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly lowStock = LOW_STOCK;

  /** Monotonic beat counter; phase + product are derived from it. */
  private readonly step = signal(1); // start at 'found' so the static frame is meaningful

  protected readonly phase = computed<Phase>(() => SEQUENCE[this.step() % SEQUENCE.length]);
  protected readonly product = computed<DemoProduct>(
    () => PRODUCTS[Math.floor(this.step() / SEQUENCE.length) % PRODUCTS.length],
  );
  /** True for the single beat after a sale is paid — drives the bump + wire pulse. */
  protected readonly justPaid = computed(() => this.phase() === 'paid');

  // ── dashboard state (seeded so the first frame looks like a real morning) ──
  private readonly salesToday = signal(12_400);
  protected readonly itemsSold = signal(37);
  protected readonly spark = signal<number[]>([0.45, 0.6, 0.5, 0.75, 0.55, 0.9, 0.7]);
  private readonly stock = signal<Record<string, number>>(
    Object.fromEntries(PRODUCTS.map((p) => [p.name, p.stock])),
  );

  protected readonly salesLabel = computed(() => this.salesToday().toLocaleString('en-KE'));
  protected readonly stockRows = computed(() =>
    PRODUCTS.slice(0, 4).map((p) => ({ name: p.name, emoji: p.emoji, qty: this.stock()[p.name] })),
  );

  constructor() {
    // Browser-only: no-op during SSR/prerender, so the seeded static frame ships.
    afterNextRender(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const id = setInterval(() => this.advance(), 1500);
      this.destroyRef.onDestroy(() => clearInterval(id));
    });
  }

  /** Advance one beat; commit the sale to the dashboard the moment it's paid. */
  private advance(): void {
    const next = this.step() + 1;
    this.step.set(next);
    if (SEQUENCE[next % SEQUENCE.length] === 'paid') this.commitSale();
  }

  /** A paid sale ripples into the dashboard: money, count, sparkline, stock. */
  private commitSale(): void {
    const p = this.product();
    this.salesToday.update((v) => v + p.price);
    this.itemsSold.update((v) => v + 1);
    this.spark.update((s) => {
      const last = s[s.length - 1];
      const nextBar = Math.max(0.3, Math.min(1, last + (Math.sin(this.step()) * 0.18 + 0.08)));
      return [...s.slice(1), nextBar];
    });
    this.stock.update((m) => ({ ...m, [p.name]: Math.max(0, (m[p.name] ?? 0) - 1) }));
  }
}
