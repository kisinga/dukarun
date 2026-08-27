import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { createGitBook, type GitBookFrameClient } from '@gitbook/embed';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { IconComponent } from '../shared/ui/icon.component';
import { LEARNING_CATEGORY_PATHS, gitBookPathForTopic } from './learning-content';

type EmbedState = 'loading' | 'ready' | 'error' | 'offline' | 'insecure' | 'unconfigured';

export const GITBOOK_PARENT_PROTOCOL = new InjectionToken<string>('GitBook parent protocol', {
  providedIn: 'root',
  factory: () => (typeof window === 'undefined' ? 'https:' : window.location.protocol),
});

@Component({
  selector: 'app-help-embed',
  imports: [RouterLink, IconComponent],
  template: `
    <section class="flex min-h-[calc(100vh-3.5rem)] flex-col bg-base-100">
      <header class="flex flex-wrap items-center gap-3 border-b border-base-300 px-4 py-3 md:px-6">
        <a routerLink="/help" class="flex min-w-0 flex-1 items-center gap-2">
          <app-icon name="heroQuestionMarkCircle" size="lg" class="text-primary" />
          <span class="truncate font-semibold">Dukarun Help</span>
        </a>
        <span class="hidden text-sm text-base-content/55 md:inline">
          Search products, selling, purchases, credit, suppliers, and reports
        </span>
        @if (externalUrl()) {
          <a
            class="btn btn-ghost btn-sm"
            [href]="externalUrl()"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in new tab
            <app-icon name="heroArrowUpRight" />
          </a>
        }
      </header>

      <div class="relative min-h-[32rem] flex-1">
        <iframe
          #frame
          class="absolute inset-0 h-full w-full border-0 bg-base-100"
          title="Dukarun knowledge hub"
          src="about:blank"
          (load)="frameLoaded()"
          (error)="frameFailed()"
        ></iframe>

        @if (state() !== 'ready') {
          <div class="absolute inset-0 grid place-items-center bg-base-100 p-6">
            <div class="max-w-md text-center">
              @switch (state()) {
                @case ('loading') {
                  <span class="loading loading-spinner loading-lg text-primary"></span>
                  <h1 class="mt-4 text-xl font-semibold">Opening Dukarun Help</h1>
                  <p class="mt-2 text-sm text-base-content/60">
                    Loading the searchable knowledge hub…
                  </p>
                }
                @case ('offline') {
                  <app-icon name="heroSignalSlash" size="xl" class="mx-auto text-warning" />
                  <h1 class="mt-4 text-xl font-semibold">Help needs an internet connection</h1>
                  <p class="mt-2 text-sm text-base-content/60">
                    Reconnect, then retry. Your work in Dukarun is not affected.
                  </p>
                  <button type="button" class="btn btn-primary mt-5" (click)="retry()">
                    Retry
                  </button>
                }
                @case ('unconfigured') {
                  <app-icon name="heroBookOpen" size="xl" class="mx-auto text-primary" />
                  <h1 class="mt-4 text-xl font-semibold">The knowledge hub is being connected</h1>
                  <p class="mt-2 text-sm text-base-content/60">
                    Set the GitBook site URL to make searchable help available here.
                  </p>
                }
                @case ('insecure') {
                  <app-icon name="heroExclamationTriangle" size="xl" class="mx-auto text-warning" />
                  <h1 class="mt-4 text-xl font-semibold">Open Help in a secure window</h1>
                  <p class="mt-2 text-sm text-base-content/60">
                    GitBook permits in-app help on HTTPS pages. This preview uses HTTP, so the
                    knowledge hub must open in a new tab.
                  </p>
                  @if (externalUrl()) {
                    <a
                      class="btn btn-primary mt-5"
                      [href]="externalUrl()"
                      target="_blank"
                      rel="noopener noreferrer"
                      >Open Dukarun Help</a
                    >
                  }
                }
                @default {
                  <app-icon name="heroExclamationTriangle" size="xl" class="mx-auto text-warning" />
                  <h1 class="mt-4 text-xl font-semibold">Help could not be loaded</h1>
                  <p class="mt-2 text-sm text-base-content/60">
                    Retry here or open the knowledge hub in a new tab.
                  </p>
                  <div class="mt-5 flex justify-center gap-2">
                    <button type="button" class="btn btn-primary" (click)="retry()">Retry</button>
                    @if (externalUrl()) {
                      <a
                        class="btn btn-ghost"
                        [href]="externalUrl()"
                        target="_blank"
                        rel="noopener noreferrer"
                        >Open in new tab</a
                      >
                    }
                  </div>
                }
              }
            </div>
          </div>
        }
      </div>
    </section>
  `,
})
export class HelpEmbedComponent implements AfterViewInit {
  @ViewChild('frame', { static: true }) private frame!: ElementRef<HTMLIFrameElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly connectivity = inject(ConnectivityService);
  private readonly parentProtocol = inject(GITBOOK_PARENT_PROTOCOL);
  private readonly siteUrl = environment.gitbookSiteUrl.trim().replace(/\/+$/, '');
  private readonly secureParent = this.parentProtocol === 'https:';
  private frameClient: GitBookFrameClient | null = null;
  private requestedFrameUrl = '';
  private viewReady = false;

  protected readonly state = signal<EmbedState>(
    !this.siteUrl
      ? 'unconfigured'
      : this.connectivity.offline()
        ? 'offline'
        : !this.secureParent
          ? 'insecure'
          : 'loading'
  );
  private readonly pagePath = signal('/');
  protected readonly externalUrl = signal('');

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const routePattern = this.route.snapshot.routeConfig?.path ?? 'help';
      const path = routePattern.includes(':domain')
        ? (LEARNING_CATEGORY_PATHS[params.get('domain') ?? ''] ?? '/')
        : routePattern.includes(':topic')
          ? (gitBookPathForTopic(params.get('topic')) ?? '/')
          : '/';
      this.pagePath.set(path);
      this.externalUrl.set(this.siteUrl ? `${this.siteUrl}${path === '/' ? '' : path}` : '');
      this.frameClient?.navigateToPage(path);
    });

    effect(() => {
      const offline = this.connectivity.offline();
      if (!this.viewReady || !this.siteUrl) return;
      if (offline) {
        this.state.set('offline');
        this.frame.nativeElement.src = 'about:blank';
        return;
      }
      if (!this.secureParent) {
        this.state.set('insecure');
        return;
      }
      if (this.state() === 'offline') this.loadFrame();
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.siteUrl && this.secureParent && !this.connectivity.offline()) this.loadFrame();
  }

  protected retry(): void {
    if (!this.siteUrl) {
      this.state.set('unconfigured');
      return;
    }
    if (this.connectivity.offline()) {
      this.state.set('offline');
      return;
    }
    if (!this.secureParent) {
      this.state.set('insecure');
      return;
    }
    this.loadFrame();
  }

  protected frameLoaded(): void {
    if (!this.requestedFrameUrl || this.frame.nativeElement.src === 'about:blank') return;
    try {
      const client = createGitBook({ siteURL: this.siteUrl });
      this.frameClient = client.createFrame(this.frame.nativeElement);
      this.frameClient.configure({
        tabs: ['docs', 'search'],
        greeting: {
          title: 'How can we help?',
          subtitle: 'Search Dukarun tasks and business terms.',
        },
        suggestions: [],
        tools: [],
        actions: [],
        trademark: true,
      });
      this.frameClient.navigateToPage(this.pagePath());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected frameFailed(): void {
    if (this.requestedFrameUrl) this.state.set('error');
  }

  private loadFrame(): void {
    this.state.set('loading');
    this.frameClient = null;
    const client = createGitBook({ siteURL: this.siteUrl });
    this.requestedFrameUrl = client.getFrameURL({});
    this.frame.nativeElement.src = this.requestedFrameUrl;
  }
}
