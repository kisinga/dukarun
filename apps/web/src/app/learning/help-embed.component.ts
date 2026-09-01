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
import { ActivatedRoute } from '@angular/router';
import { createGitBook, type GitBookFrameClient } from '@gitbook/embed';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { ThemeService } from '../core/theme.service';
import { IconComponent } from '../shared/ui/icon.component';
import {
  LEARNING_CATEGORY_PATHS,
  LEARNING_CONTENT_REGISTRY,
  gitBookPathForTopic,
  isLearningContentKey,
  type LearningContentKey,
} from './learning-content';
import { LearningPlatformService } from './learning-platform.service';

type EmbedState = 'loading' | 'ready' | 'error' | 'offline' | 'insecure' | 'unconfigured';

export const GITBOOK_PARENT_PROTOCOL = new InjectionToken<string>('GitBook parent protocol', {
  providedIn: 'root',
  factory: () => (typeof window === 'undefined' ? 'https:' : window.location.protocol),
});

@Component({
  selector: 'app-help-embed',
  imports: [IconComponent],
  template: `
    <section
      class="flex h-[calc(100dvh-7.5rem)] min-h-[32rem] flex-col overflow-hidden bg-base-100 lg:h-[calc(100dvh-3.5rem)]"
      aria-label="Dukarun Guide"
    >
      <header class="shrink-0 border-b border-base-300 bg-base-100 px-3 py-3 sm:px-5 sm:py-4">
        <div
          class="mx-auto flex max-w-6xl flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div class="flex min-w-0 gap-3 sm:gap-4">
            <span
              class="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-content shadow-sm"
            >
              <app-icon name="heroBookOpen" size="md" />
            </span>
            <div class="min-w-0">
              <p class="text-xs font-bold uppercase tracking-[0.12em] text-primary">
                Learn by doing
              </p>
              @if (contentKey(); as key) {
                <h1 class="mt-1 text-base font-bold text-base-content sm:text-lg">
                  Try {{ LEARNING_CONTENT_REGISTRY[key].title.toLocaleLowerCase() }} in Dukarun
                </h1>
              } @else {
                <h1 class="mt-1 text-base font-bold text-base-content sm:text-lg">
                  Let the guide walk with you through the real task
                </h1>
              }
              <p class="mt-1 max-w-3xl text-sm leading-5 text-base-content/70">
                Follow each highlight and complete the requested action before choosing Next. You
                can dismiss the guide at any time and continue working.
              </p>
            </div>
          </div>
          <button
            type="button"
            class="btn btn-primary shrink-0 sm:self-center"
            (click)="launchInteractiveGuide(contentKey() ?? 'first-business-cycle')"
          >
            {{ contentKey() ? 'Start interactive guide' : 'Start your first business cycle' }}
          </button>
        </div>
      </header>

      <div class="relative min-h-0 flex-1">
        <iframe
          #frame
          class="absolute inset-0 h-full w-full border-0 bg-base-100"
          title="Dukarun Guide"
          src="about:blank"
          allow="clipboard-write"
          [style.color-scheme]="theme.theme()"
          (load)="frameLoaded()"
          (error)="frameFailed()"
        ></iframe>

        @if (state() !== 'ready') {
          <div
            class="absolute inset-0 grid place-items-center bg-base-200/40 p-5"
            role="status"
            aria-live="polite"
          >
            <div
              class="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 px-6 py-8 text-center shadow-sm sm:px-10"
            >
              @switch (state()) {
                @case ('loading') {
                  <span class="loading loading-spinner loading-md text-primary"></span>
                  <h1 class="mt-4 text-lg font-semibold">Opening Dukarun Guide</h1>
                  <p class="mt-2 text-sm text-base-content/60">
                    Loading the official, searchable documentation…
                  </p>
                }
                @case ('offline') {
                  <span class="mx-auto grid size-12 place-items-center rounded-2xl bg-warning/10">
                    <app-icon name="heroSignalSlash" size="lg" class="text-warning" />
                  </span>
                  <h1 class="mt-4 text-lg font-semibold">
                    Dukarun Guide needs an internet connection
                  </h1>
                  <p class="mt-2 text-sm text-base-content/60">
                    Reconnect, then retry. Your work in Dukarun is not affected.
                  </p>
                  <div class="mt-5 flex flex-wrap justify-center gap-2">
                    <button type="button" class="btn btn-primary btn-sm" (click)="retry()">
                      Retry
                    </button>
                    @if (externalUrl()) {
                      <a
                        class="btn btn-ghost btn-sm"
                        [href]="externalUrl()"
                        target="_blank"
                        rel="noopener noreferrer"
                        >Open in new tab</a
                      >
                    }
                  </div>
                }
                @case ('unconfigured') {
                  <span class="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10">
                    <app-icon name="heroBookOpen" size="lg" class="text-primary" />
                  </span>
                  <h1 class="mt-4 text-lg font-semibold">Dukarun Guide is being connected</h1>
                  <p class="mt-2 text-sm text-base-content/60">
                    Set the GitBook site URL to make the searchable guide available here.
                  </p>
                }
                @case ('insecure') {
                  <span class="mx-auto grid size-12 place-items-center rounded-2xl bg-warning/10">
                    <app-icon name="heroExclamationTriangle" size="lg" class="text-warning" />
                  </span>
                  <h1 class="mt-4 text-lg font-semibold">
                    Dukarun Guide needs HTTPS in local development
                  </h1>
                  <p class="mt-2 text-sm text-base-content/60">
                    Start Dukarun with <code>npm run dev:web:https</code> to test the real embedded
                    guide, or open this page directly in GitBook.
                  </p>
                  @if (externalUrl()) {
                    <a
                      class="btn btn-primary btn-sm mt-5"
                      [href]="externalUrl()"
                      target="_blank"
                      rel="noopener noreferrer"
                      >Open GitBook</a
                    >
                  }
                }
                @default {
                  <span class="mx-auto grid size-12 place-items-center rounded-2xl bg-warning/10">
                    <app-icon name="heroExclamationTriangle" size="lg" class="text-warning" />
                  </span>
                  <h1 class="mt-4 text-lg font-semibold">Dukarun Guide could not be loaded</h1>
                  <p class="mt-2 text-sm text-base-content/60">
                    Retry here or open the guide in a new tab.
                  </p>
                  <div class="mt-5 flex justify-center gap-2">
                    <button type="button" class="btn btn-primary btn-sm" (click)="retry()">
                      Retry
                    </button>
                    @if (externalUrl()) {
                      <a
                        class="btn btn-ghost btn-sm"
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
  private readonly learning = inject(LearningPlatformService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly connectivity = inject(ConnectivityService);
  protected readonly theme = inject(ThemeService);
  private readonly parentProtocol = inject(GITBOOK_PARENT_PROTOCOL);
  private readonly siteUrl = environment.gitbookSiteUrl.trim().replace(/\/+$/, '');
  private readonly secureParent = this.parentProtocol === 'https:';
  private frameClient: GitBookFrameClient | null = null;
  private requestedFrameUrl = '';
  private frameHasLoaded = false;
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
  protected readonly contentKey = signal<LearningContentKey | null>(null);
  protected readonly LEARNING_CONTENT_REGISTRY = LEARNING_CONTENT_REGISTRY;
  protected readonly externalUrl = signal('');

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const routePattern = this.route.snapshot.routeConfig?.path ?? 'help';
      const path = routePattern.includes(':domain')
        ? (LEARNING_CATEGORY_PATHS[params.get('domain') ?? ''] ?? '/')
        : routePattern.includes(':topic')
          ? (gitBookPathForTopic(params.get('topic')) ?? '/')
          : '/';
      const topic = params.get('topic');
      this.contentKey.set(isLearningContentKey(topic) ? topic : null);
      this.pagePath.set(path);
      this.externalUrl.set(this.siteUrl ? `${this.siteUrl}${path === '/' ? '' : path}` : '');
      this.configureFrame();
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

  protected launchInteractiveGuide(key: LearningContentKey): void {
    const definition = LEARNING_CONTENT_REGISTRY[key];
    void this.learning.launch(key, { continue: definition.type === 'journey' });
  }

  protected frameLoaded(): void {
    if (!this.requestedFrameUrl || this.frame.nativeElement.src === 'about:blank') return;
    if (!this.frameHasLoaded) {
      this.frameHasLoaded = true;
      this.frameClient?.navigateToPage(this.pagePath());
    }
    this.state.set('ready');
  }

  protected frameFailed(): void {
    if (this.requestedFrameUrl) this.state.set('error');
  }

  private loadFrame(): void {
    this.state.set('loading');
    this.frameClient = null;
    this.frameHasLoaded = false;
    try {
      const client = createGitBook({ siteURL: this.siteUrl });
      // GitBook follows this iframe's CSS color-scheme, keeping it in sync when Dukarun's
      // light/dark theme changes without reloading or maintaining a second theme setting.
      this.requestedFrameUrl = client.getFrameURL({});
      this.frame.nativeElement.src = this.requestedFrameUrl;
      this.frameClient = client.createFrame(this.frame.nativeElement);
      this.configureFrame();
      this.frameClient.navigateToPage(this.pagePath());
    } catch {
      this.state.set('error');
    }
  }

  private configureFrame(): void {
    if (!this.frameClient) return;
    const actionKey = this.contentKey() ?? 'first-business-cycle';
    this.frameClient.configure({
      tabs: ['assistant', 'search', 'docs'],
      greeting: {
        title: 'How can we help?',
        subtitle: 'Search Dukarun Guide for tasks and business terms.',
      },
      actions: [
        {
          icon: 'play',
          label:
            actionKey === 'first-business-cycle'
              ? 'Start your first business cycle'
              : `Start ${LEARNING_CONTENT_REGISTRY[actionKey].title.toLocaleLowerCase()}`,
          onClick: () => this.launchInteractiveGuide(actionKey),
        },
      ],
      trademark: true,
    });
  }
}
