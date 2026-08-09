import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-marketing-video',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="mb-0">
      <div class="aspect-video overflow-hidden rounded-box bg-base-300 shadow-overlay">
        <video
          class="h-full w-full bg-black object-cover"
          controls
          playsinline
          [attr.aria-label]="title()"
          [attr.poster]="poster() || null"
          [attr.preload]="preload()"
        >
          <source [src]="src()" type="video/mp4" />
          @if (captions()) {
            <track default kind="captions" srclang="en" label="English" [src]="captions()" />
          }
          Your browser does not support embedded video.
        </video>
      </div>
      @if (caption()) {
        <figcaption class="mt-3 text-sm text-base-content/70">{{ caption() }}</figcaption>
      }
    </figure>
  `,
})
export class MarketingVideoComponent {
  readonly src = input.required<string>();
  readonly title = input.required<string>();
  readonly poster = input('');
  readonly captions = input('');
  readonly caption = input('');
  readonly preload = input<'none' | 'metadata'>('metadata');
}
