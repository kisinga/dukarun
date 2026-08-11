import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-marketing-video',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="mx-auto mb-0 max-w-6xl">
      <div
        class="group relative aspect-square overflow-hidden rounded-[1.25rem] border border-base-300/70 bg-neutral shadow-[0_28px_80px_-32px_rgb(0_0_0/0.55)] sm:aspect-video sm:rounded-[1.75rem]"
      >
        <video
          #video
          class="h-full w-full bg-neutral object-contain"
          [controls]="started()"
          playsinline
          [attr.aria-label]="title()"
          [attr.preload]="preload()"
          (play)="onPlay()"
          (ended)="onEnded()"
          (error)="playbackError.set(true)"
        >
          @if (mobileSrc()) {
            <source [src]="mobileSrc()" type="video/mp4" media="(max-width: 639px)" />
          }
          <source [src]="src()" type="video/mp4" />
          @if (captions()) {
            <track kind="captions" srclang="en" label="English" [src]="captions()" />
          }
          Your browser does not support embedded video.
        </video>

        @if (!started() && poster()) {
          <picture class="pointer-events-none absolute inset-0" aria-hidden="true">
            @if (mobilePoster()) {
              <source [srcset]="mobilePoster()" media="(max-width: 639px)" />
            }
            <img class="h-full w-full object-cover" [src]="poster()" alt="" decoding="async" />
          </picture>
        }

        @if (!started()) {
          <div
            class="absolute inset-0 flex flex-col bg-gradient-to-t from-black/80 via-black/20 to-black/45 p-4 text-white sm:p-7"
          >
            <div class="flex items-center justify-between gap-3 text-xs font-semibold">
              <span
                class="rounded-full border border-white/20 bg-black/25 px-3 py-1.5 tracking-[0.12em] uppercase backdrop-blur-md"
              >
                {{ label() }}
              </span>
              @if (duration()) {
                <span class="rounded-full bg-black/25 px-3 py-1.5 backdrop-blur-md">
                  {{ duration() }}
                </span>
              }
            </div>

            <button
              type="button"
              class="group/play m-auto flex min-h-16 min-w-16 items-center justify-center rounded-full border border-white/35 bg-white/95 text-primary shadow-[0_18px_45px_-12px_rgb(0_0_0/0.7)] transition duration-200 hover:scale-105 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:min-h-20 sm:min-w-20"
              [attr.aria-label]="ended() ? 'Replay ' + title() : 'Play ' + title()"
              (click)="play()"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                class="ml-1 h-7 w-7 transition-transform group-hover/play:scale-110 sm:h-9 sm:w-9"
                fill="currentColor"
              >
                <path
                  d="M8 5.7v12.6c0 .8.9 1.3 1.6.8l9-6.3a1 1 0 0 0 0-1.6l-9-6.3A1 1 0 0 0 8 5.7Z"
                />
              </svg>
            </button>

            <div
              class="-mx-4 -mb-4 flex items-end justify-between gap-4 bg-neutral px-4 py-4 sm:-mx-7 sm:-mb-7 sm:px-7 sm:py-5"
            >
              <div>
                <p class="mb-0 text-lg font-semibold sm:text-2xl">
                  {{ ended() ? 'Watch again' : title() }}
                </p>
                @if (summary()) {
                  <p class="mb-0 mt-1 hidden text-sm text-white/75 sm:block">
                    {{ summary() }}
                  </p>
                }
              </div>
              <span class="hidden text-xs font-medium text-white/70 sm:block"
                >Captions available</span
              >
            </div>
          </div>
        }

        <div
          class="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10"
          aria-hidden="true"
        ></div>
      </div>
      @if (playbackError()) {
        <p role="alert" class="mt-3 text-sm text-error">
          The video could not start. Please refresh the page and try again.
        </p>
      }
      @if (caption()) {
        <figcaption class="mt-3 text-sm text-base-content/70">{{ caption() }}</figcaption>
      }
    </figure>
  `,
})
export class MarketingVideoComponent {
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly src = input.required<string>();
  readonly mobileSrc = input('');
  readonly title = input.required<string>();
  readonly poster = input('');
  readonly mobilePoster = input('');
  readonly captions = input('');
  readonly caption = input('');
  readonly label = input('Product overview');
  readonly duration = input('');
  readonly summary = input('');
  readonly preload = input<'none' | 'metadata'>('metadata');

  protected readonly started = signal(false);
  protected readonly ended = signal(false);
  protected readonly playbackError = signal(false);

  protected play(): void {
    this.playbackError.set(false);
    void this.video()
      ?.nativeElement.play()
      .catch(() => this.playbackError.set(true));
  }

  protected onPlay(): void {
    this.started.set(true);
    this.ended.set(false);
  }

  protected onEnded(): void {
    this.started.set(false);
    this.ended.set(true);
  }
}
