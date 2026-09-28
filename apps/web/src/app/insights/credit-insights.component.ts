import { ListStateService } from '../shared/list/list-state';
import { ListReturnDirective } from '../shared/list/list-return.directive';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { bindListQuery, listQueryField } from '../shared/list/list-query';
import {
  DataTableShellComponent,
  TableRowsDirective,
  type TableColumn,
} from '../shared/ui/data-table-shell.component';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, Scroll } from '@angular/router';
import { formatKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { IconComponent } from '../shared/ui/icon.component';
import { SectionTabsComponent } from '../shared/ui/section-tabs.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { MoneyCreditComponent } from '../money/credit/money-credit.component';
import { InsightsService } from './insights.service';
import { insightCopy, type PartyCreditProfile } from './insights.models';
import { ScoreBadgeComponent } from './score-badge.component';

@Component({
  selector: 'app-credit-insights',
  imports: [
    ListSearchBarComponent,
    DataTableShellComponent,
    TableRowsDirective,
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    MoneyCreditComponent,
    ScoreBadgeComponent,
    SectionTabsComponent,
    FormFieldComponent,
  ],
  template: `
    <section class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Credit view" class="credit-view-nav flex min-w-0 max-w-full gap-1">
          <a
            appButton
            [variant]="view() === 'overview' ? 'soft' : 'ghost'"
            [routerLink]="[]"
            [queryParams]="{ view: 'overview' }"
            queryParamsHandling="merge"
            [attr.aria-current]="view() === 'overview' ? 'page' : null"
            >Overview</a
          >
          <a
            appButton
            [variant]="view() === 'profiles' ? 'soft' : 'ghost'"
            [routerLink]="[]"
            [queryParams]="{ view: 'profiles' }"
            queryParamsHandling="merge"
            [attr.aria-current]="view() === 'profiles' ? 'page' : null"
            >Customer / supplier standings</a
          >
        </nav>
        @if (view() === 'overview') {
          <button appButton variant="outline" size="sm" type="button" (click)="findParty()">
            Find an account
          </button>
        }
      </div>
      <app-money-credit [hidden]="view() !== 'overview'" />
      <section
        [hidden]="view() !== 'profiles'"
        id="credit-profiles"
        tabindex="-1"
        aria-labelledby="credit-profiles-heading"
        class="scroll-mt-20 space-y-4"
      >
        <section class="card bg-base-100">
          <div class="card-body gap-4 p-4 sm:p-5">
            <header class="credit-portfolio-heading">
              <div>
                <h2 id="credit-profiles-heading" class="section-title">
                  Customer / supplier standings
                </h2>
                <p class="type-caption mt-1">
                  {{
                    side() === 'customer'
                      ? 'Find a customer, compare repayment evidence, and review credit recommendations.'
                      : 'Review what we owe suppliers and how reliably we pay them.'
                  }}
                </p>
              </div>
              <app-section-tabs
                class="credit-portfolio-side"
                [items]="portfolioSides"
                [value]="side()"
                ariaLabel="Profile type"
                mobileLabel="Profile type"
                (valueChange)="setSide($event)"
              />
              <button
                class="credit-portfolio-refresh"
                appButton
                variant="ghost"
                [iconOnly]="true"
                type="button"
                title="Refresh credit profiles"
                aria-label="Refresh credit profiles"
                [loading]="loading()"
                (click)="load()"
              >
                <app-icon name="heroArrowPath" />
              </button>
            </header>

            <app-list-search-bar
              [embedded]="true"
              [searchLabel]="side() === 'customer' ? 'Search customers' : 'Search suppliers'"
              [placeholder]="side() === 'customer' ? 'Search customers' : 'Search suppliers'"
              [searchQuery]="search()"
              (searchQueryChange)="search.set($event); resetPage()"
              [activeFilters]="creditFilterChips()"
              (removeFilter)="removeCreditFilter($event)"
              (clearFilters)="band.set(''); overdueOnly.set(false); resetPage()"
            >
              <div quickFilters class="flex flex-wrap items-end gap-3">
                <app-form-field label="Credit band" class="w-32 max-w-full sm:w-40">
                  <select
                    class="select select-bordered select-sm min-h-11 w-full"
                    [value]="band()"
                    (change)="setBand($event)"
                  >
                    <option value="">All bands</option>
                    <option value="strong">Strong</option>
                    <option value="good">Good</option>
                    <option value="watch">Watch</option>
                    <option value="restricted">Restricted</option>
                    <option value="high_risk">High risk</option>
                    <option value="unrated">Unrated</option>
                  </select>
                </app-form-field>
                <label class="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [checked]="overdueOnly()"
                    (change)="toggleOverdue($event)"
                  />
                  <span>Overdue only</span>
                </label>
              </div></app-list-search-bar
            >
          </div>
        </section>

        <div
          id="credit-records"
          tabindex="-1"
          class="scroll-mt-20 flex flex-wrap items-center justify-between gap-3"
        >
          <div class="text-sm" aria-live="polite" aria-atomic="true">
            <p>{{ recordRange() }}</p>
            <p class="type-caption">
              Highest risk first
              @if (hasCreditFilters()) {
                · Matching profile filters
              }
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 text-sm">
              Per page
              <select
                class="select select-bordered select-sm min-h-11 w-20"
                [value]="pageSize()"
                (change)="setPageSize($event)"
              >
                @for (size of pageSizes; track size) {
                  <option [value]="size" [selected]="size === pageSize()">{{ size }}</option>
                }
              </select>
            </label>
            <ng-container
              [ngTemplateOutlet]="pageControls"
              [ngTemplateOutletContext]="{ location: 'top' }"
            />
          </div>
        </div>
        <ng-template #pageControls let-location="location">
          <nav
            [attr.aria-label]="'Standings pagination ' + location"
            class="flex items-center gap-2"
          >
            <button
              appButton
              variant="outline"
              type="button"
              [disabled]="loading() || !!error() || page() <= 1"
              (click)="changePage(page() - 1)"
            >
              Previous
            </button>
            <span class="whitespace-nowrap text-sm tabular-nums">Page {{ displayedPage() }}</span>
            <button
              appButton
              variant="outline"
              type="button"
              [disabled]="loading() || !!error() || !hasNextPage()"
              (click)="changePage(page() + 1)"
            >
              Next
            </button>
          </nav>
        </ng-template>

        @if (error()) {
          <div role="alert" class="alert alert-error text-sm">
            <app-icon name="heroExclamationTriangle" />{{ error() }}
            <button appButton variant="ghost" (click)="load(true, retryPage, true)">Retry</button>
          </div>
        }
        @if (loading() && profiles().length === 0) {
          <div class="flex min-h-56 items-center justify-center gap-2 text-sm text-base-content/60">
            <span class="loading loading-spinner"></span>Loading credit profiles
          </div>
        } @else if (profiles().length === 0 && !error()) {
          <app-empty-state
            icon="heroCreditCard"
            [title]="
              hasCreditFilters()
                ? 'No profiles match these filters'
                : side() === 'customer'
                  ? 'No customer credit profiles yet'
                  : 'No supplier credit profiles yet'
            "
            [description]="
              hasCreditFilters()
                ? 'Clear filters or try another party name.'
                : 'Profiles appear after credit activity. Updates can take up to two minutes.'
            "
          />
        } @else if (profiles().length > 0) {
          <div class="card bg-base-100">
            <div class="hidden lg:block">
              <app-data-table-shell [columns]="tableColumns1()" tableClass="table-sm"
                ><ng-template tableRows>
                  @for (profile of visibleProfiles(); track profile.party_id) {
                    <tr [attr.data-list-record]="profile.party_id">
                      <td>
                        <p class="font-semibold">{{ profile.party_name }}</p>
                        <p class="type-caption">
                          Updated {{ profile.refreshed_at | date: 'MMM d, h:mm a' }}
                        </p>
                      </td>
                      <td
                        class="text-right tabular-nums"
                        [class.text-error]="profile.overdue_amount > 0"
                      >
                        {{ fmt(profile.overdue_amount) }}
                        @if (profile.oldest_overdue_days > 0) {
                          <p class="type-caption">{{ profile.oldest_overdue_days }} days overdue</p>
                        }
                      </td>
                      <td class="text-right font-semibold tabular-nums">
                        {{ fmt(profile.balance) }}
                      </td>
                      <td class="max-w-64 text-sm">{{ copy(profile.recommendation_code) }}</td>
                      <td>
                        <app-score-badge
                          [score]="profile.score"
                          [band]="profile.band"
                          [confidence]="profile.confidence"
                        />
                        <div class="mt-1">
                          <p class="text-sm">{{ copy(profile.reason_codes[0]) }}</p>
                          <p class="type-caption">
                            <span class="capitalize">{{ profile.confidence }}</span> confidence ·
                            {{ profile.settled_documents }} settled documents
                          </p>
                        </div>
                      </td>
                      <td>
                        <a
                          class="btn btn-ghost btn-sm min-h-11"
                          [routerLink]="['/insights/credit', side(), profile.party_id]"
                          [queryParams]="{ returnTo: router.url }"
                          >Review</a
                        >
                      </td>
                    </tr>
                  }
                </ng-template></app-data-table-shell
              >
            </div>
            <div class="divide-y divide-base-200 lg:hidden">
              @for (profile of visibleProfiles(); track profile.party_id) {
                <article [attr.data-list-record]="profile.party_id" class="space-y-3 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate font-semibold">{{ profile.party_name }}</p>
                      <p class="type-caption">
                        Updated {{ profile.refreshed_at | date: 'MMM d, h:mm a' }}
                      </p>
                    </div>
                    <app-score-badge
                      [score]="profile.score"
                      [band]="profile.band"
                      [confidence]="profile.confidence"
                    />
                  </div>
                  <p class="text-sm">{{ copy(profile.reason_codes[0]) }}</p>
                  <p class="type-caption">
                    <span class="capitalize">{{ profile.confidence }}</span> confidence ·
                    {{ profile.settled_documents }} settled documents
                  </p>
                  <dl class="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt class="type-caption">
                        {{ side() === 'customer' ? 'Owed to us' : 'We owe' }}
                      </dt>
                      <dd class="font-semibold tabular-nums">{{ fmt(profile.balance) }}</dd>
                    </div>
                    <div>
                      <dt class="type-caption">Overdue</dt>
                      <dd
                        class="font-semibold tabular-nums"
                        [class.text-error]="profile.overdue_amount > 0"
                      >
                        {{ fmt(profile.overdue_amount) }}
                        @if (profile.oldest_overdue_days > 0) {
                          <p class="type-caption">{{ profile.oldest_overdue_days }} days overdue</p>
                        }
                      </dd>
                    </div>
                  </dl>
                  <div class="flex items-end justify-between gap-3">
                    <p class="type-caption max-w-64">{{ copy(profile.recommendation_code) }}</p>
                    <a
                      class="btn btn-ghost btn-sm min-h-11 shrink-0"
                      [routerLink]="['/insights/credit', side(), profile.party_id]"
                      [queryParams]="{ returnTo: router.url }"
                      >Review</a
                    >
                  </div>
                </article>
              }
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="type-caption">{{ recordRange() }}</p>
            <ng-container
              [ngTemplateOutlet]="pageControls"
              [ngTemplateOutletContext]="{ location: 'bottom' }"
            />
          </div>
        }

        @if (loading() && profiles().length > 0) {
          <p role="status" class="type-caption">Updating profiles…</p>
        }
        <a
          appButton
          variant="ghost"
          size="sm"
          [routerLink]="[]"
          [queryParams]="{ view: 'overview' }"
          queryParamsHandling="merge"
          >Back to overview</a
        >
        <p class="text-xs text-base-content/60">
          Scores use settled activity from the latest 365 days plus every open document. Advice
          never changes a limit automatically.
        </p>
      </section>
    </section>
  `,
  styles: `
    .credit-view-nav a {
      white-space: normal;
      flex: 0 1 auto;
      min-width: 0;
    }
    .credit-view-nav a:first-child {
      flex-shrink: 0;
    }
    .credit-portfolio-heading {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.75rem 1.5rem;
    }

    .credit-portfolio-side {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .credit-portfolio-refresh {
      grid-column: 2;
      grid-row: 1;
      align-self: start;
    }

    @media (min-width: 1280px) {
      .credit-portfolio-heading {
        grid-template-columns: minmax(0, 1fr) auto auto;
      }

      .credit-portfolio-side {
        grid-column: 2;
        grid-row: 1;
      }

      .credit-portfolio-refresh {
        grid-column: 3;
        align-self: center;
      }
    }
  `,
})
export class CreditInsightsComponent implements OnInit, OnDestroy {
  protected readonly router = inject(Router);
  protected readonly creditFilterChips = computed(() => [
    ...(this.band() ? [{ key: 'band', label: 'Band: ' + this.band().replaceAll('_', ' ') }] : []),
    ...(this.overdueOnly() ? [{ key: 'overdue', label: 'Overdue only' }] : []),
  ]);
  protected removeCreditFilter(key: string): void {
    if (key === 'band') this.band.set('');
    if (key === 'overdue') this.overdueOnly.set(false);
    this.resetPage();
  }
  protected readonly tableColumns1 = computed<TableColumn[]>(() => [
    { key: 'party', label: this.side() === 'customer' ? 'Customer' : 'Supplier', pinned: true },
    { key: 'overdue', label: 'Overdue', align: 'right' },
    { key: 'balance', label: this.side() === 'customer' ? 'Owed to us' : 'We owe', align: 'right' },
    { key: 'recommendation', label: 'Recommendation' },
    {
      key: 'score',
      label: this.side() === 'customer' ? 'Credit / evidence' : 'Our standing / evidence',
    },
    { key: 'review', label: 'Review' },
  ]);
  private readonly insights = inject(InsightsService);
  private readonly listState = inject(ListStateService);
  private readonly listReturn = inject(ListReturnDirective, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly view = signal<'overview' | 'profiles'>('overview');
  private findRequested = false;
  private focusFrame = 0;
  private snapshotScope = '';
  private currentListUrl = '';
  protected readonly portfolioSides = [
    { value: 'customer', label: 'Customers' },
    { value: 'supplier', label: 'Our supplier standing' },
  ];
  protected readonly side = signal<'customer' | 'supplier'>('customer');
  protected readonly band = signal('');
  protected readonly overdueOnly = signal(false);
  protected readonly search = signal('');
  protected readonly hasCreditFilters = computed(
    () => !!this.search().trim() || !!this.band() || this.overdueOnly()
  );
  protected readonly profiles = signal<PartyCreditProfile[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly pageSizes = [10, 25, 50, 100];
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly displayedPage = signal(1);
  private readonly displayedPageSize = signal(25);
  protected readonly visibleProfiles = computed(() =>
    this.profiles().slice(
      (this.displayedPage() - 1) * this.displayedPageSize(),
      this.displayedPage() * this.displayedPageSize()
    )
  );
  protected readonly hasNextPage = computed(
    () => this.profiles().length > this.page() * this.pageSize() || this.nextCursor() !== null
  );
  protected readonly recordRange = computed(() => {
    const count = this.profiles().length;
    const start = count ? (this.displayedPage() - 1) * this.displayedPageSize() + 1 : 0;
    const end = Math.min(this.displayedPage() * this.displayedPageSize(), count);
    const total = this.nextCursor() === null ? ` of ${count}` : '';
    const party = this.side() === 'customer' ? 'customer' : 'supplier';
    if (!count) return `0 ${party} profiles`;
    return `${start}–${end}${total} ${party} ${count === 1 ? 'profile' : 'profiles'}`;
  });
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copy = insightCopy;
  protected readonly fmt = formatKes;
  private loadRequest = 0;
  protected retryPage = 1;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      // Older filtered links should still open the directory they describe.
      const legacyProfiles = ['side', 'band', 'search', 'overdue', 'page', 'pageSize'].some(key =>
        params.has(key)
      );
      this.view.set(
        params.get('view') === 'profiles' || (!params.has('view') && legacyProfiles)
          ? 'profiles'
          : 'overview'
      );
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (!(event instanceof Scroll) || !this.findRequested) return;
      this.findRequested = false;
      // Run after the shell's saved-position restoration. A deliberate search
      // shortcut starts at search; ordinary view switches keep their position.
      this.focusFrame = requestAnimationFrame(() => {
        this.focusFrame = requestAnimationFrame(() => {
          const search =
            this.host.nativeElement.querySelector<HTMLInputElement>('input[type="search"]');
          search?.focus({ preventScroll: true });
          search?.scrollIntoView({ block: 'center' });
        });
      });
    });
    bindListQuery(
      {
        side: listQueryField(this.side, { values: ['customer', 'supplier'] }),
        band: listQueryField(this.band),
        search: listQueryField(this.search),
        overdue: listQueryField(this.overdueOnly),
        page: listQueryField(this.page, { max: 1000 }),
        pageSize: listQueryField(this.pageSize, { values: this.pageSizes }),
      },
      () => void this.load()
    );
  }

  ngOnInit(): void {
    this.snapshotScope = this.listState.scopeToken();
    this.currentListUrl = this.profileUrl();
    const cached = this.listState.read<{
      profiles: PartyCreditProfile[];
      nextCursor: string | null;
    }>(this.currentListUrl);
    if (cached) {
      this.profiles.set(cached.profiles);
      this.nextCursor.set(cached.nextCursor);
      this.displayedPage.set(this.page());
      this.displayedPageSize.set(this.pageSize());
    } else void this.load();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.focusFrame);
    this.loadRequest++;
    if (this.profiles().length && !this.loading() && !this.error())
      this.listState.save(
        this.currentListUrl,
        {
          profiles: this.profiles(),
          nextCursor: this.nextCursor(),
        },
        this.snapshotScope
      );
  }

  protected findParty(): void {
    this.findRequested = true;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: 'profiles' },
      queryParamsHandling: 'merge',
    });
  }

  private profileUrl(): string {
    return this.router
      .createUrlTree([], {
        relativeTo: this.route,
        queryParams: {
          view: 'profiles',
          side: this.side() === 'customer' ? null : this.side(),
          band: this.band() || null,
          search: this.search() || null,
          overdue: this.overdueOnly() ? 'true' : null,
          page: this.page() === 1 ? null : this.page(),
          pageSize: this.pageSize() === 25 ? null : this.pageSize(),
        },
        queryParamsHandling: 'merge',
      })
      .toString();
  }

  protected setSide(side: string): void {
    if (side !== 'customer' && side !== 'supplier') return;
    this.side.set(side);
    this.resetPage();
  }
  protected setBand(event: Event): void {
    this.band.set((event.target as HTMLSelectElement).value);
    this.resetPage();
  }
  protected toggleOverdue(event: Event): void {
    this.overdueOnly.set((event.target as HTMLInputElement).checked);
    this.resetPage();
  }
  protected resetPage(): void {
    this.page.set(1);
    void this.load();
  }

  protected setPageSize(event: Event): void {
    const size = Number((event.target as HTMLSelectElement).value);
    if (!this.pageSizes.includes(size)) return;
    this.pageSize.set(size);
    this.resetPage();
  }

  protected changePage(page: number): void {
    if (this.loading() || this.error() || page < 1 || (page > this.page() && !this.hasNextPage()))
      return;
    void this.load(false, page, true);
  }

  protected async load(refresh = true, targetPage = this.page(), scroll = false): Promise<void> {
    let items = refresh ? [] : [...this.profiles()];
    let cursor = refresh ? null : this.nextCursor();
    let firstRequest = refresh;
    const size = this.pageSize();
    const filters = {
      side: this.side(),
      band: this.band() || null,
      overdueOnly: this.overdueOnly(),
      search: this.search().trim() || null,
    };
    const request = ++this.loadRequest;
    this.retryPage = targetPage;
    this.loading.set(true);
    this.error.set(null);
    try {
      // One extra record tells us whether Next is useful, including exact-size
      // final pages. The existing RPC caps each cursor request at 100 records.
      while (firstRequest || (cursor !== null && items.length <= targetPage * size)) {
        const data = await this.insights.creditProfiles({
          ...filters,
          cursor,
          limit: Math.min(100, targetPage * size + 1 - items.length),
        });
        if (request !== this.loadRequest) return;
        firstRequest = false;
        // A removed cursor can restart the RPC. Ask for a refresh rather than
        // repeating accounts or presenting an incomplete list as an exact total.
        const seen = new Set(items.map(profile => profile.party_id));
        if (
          data.items.some(profile => seen.has(profile.party_id)) ||
          (data.nextCursor !== null && data.nextCursor === cursor)
        ) {
          throw new Error('Accounts changed while paging. Retry to refresh the list.');
        }
        items = [...items, ...data.items];
        cursor = data.nextCursor;
      }
      const page = Math.min(targetPage, Math.max(1, Math.ceil(items.length / size)));
      this.snapshotScope = this.listState.scopeToken();
      this.profiles.set(items);
      this.nextCursor.set(cursor);
      this.displayedPage.set(page);
      this.displayedPageSize.set(size);
      this.page.set(page);
      this.currentListUrl = this.profileUrl();
      if (scroll) {
        const records = this.host.nativeElement.querySelector<HTMLElement>('#credit-records');
        if (records) {
          records.focus({ preventScroll: true });
          this.listReturn?.scrollToRecords(records);
        }
      }
    } catch (error) {
      if (request !== this.loadRequest) return;
      this.error.set(error instanceof Error ? error.message : 'Could not load credit profiles.');
    } finally {
      if (request === this.loadRequest) this.loading.set(false);
    }
  }
}
