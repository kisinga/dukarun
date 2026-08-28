import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IconComponent } from '../shared/ui/icon.component';
import { LEARNING_CONTENT_REGISTRY, isLearningContentKey } from './learning-content';
import { LearningPlatformService, type LearningLaunchResult } from './learning-platform.service';

@Component({
  selector: 'app-learning-launch',
  imports: [RouterLink, IconComponent],
  template: `
    <section class="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-4 py-10">
      <div class="w-full rounded-box border border-base-300 bg-base-100 p-6 text-center shadow-sm">
        @if (title()) {
          <app-icon name="heroAcademicCap" size="xl" class="mx-auto text-primary" />
          <h1 class="mt-4 text-2xl font-semibold">{{ title() }}</h1>
        }

        @if (!result()) {
          <span class="loading loading-spinner loading-md mt-5 text-primary"></span>
          <p class="mt-3 text-sm text-base-content/60">Opening your guide…</p>
          <p class="mt-1 text-xs text-base-content/50">You can dismiss it at any time.</p>
        } @else {
          <p class="mt-3 text-sm text-base-content/65">{{ resultMessage() }}</p>
          <div class="mt-5 flex flex-wrap justify-center gap-2">
            @if (destination()) {
              <a class="btn btn-primary" [routerLink]="destination()">Continue in Dukarun</a>
            }
            <a class="btn btn-ghost" [routerLink]="helpDestination()">Read the written guide</a>
          </div>
        }
      </div>
    </section>
  `,
})
export class LearningLaunchComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly learning = inject(LearningPlatformService);

  protected readonly title = signal('Learning guide');
  protected readonly destination = signal('/dashboard');
  protected readonly helpDestination = signal('/help');
  protected readonly result = signal<LearningLaunchResult | 'not-found' | null>(null);

  async ngOnInit(): Promise<void> {
    const key = this.route.snapshot.paramMap.get('contentKey');
    if (!isLearningContentKey(key)) {
      this.result.set('not-found');
      return;
    }
    const definition = LEARNING_CONTENT_REGISTRY[key];
    this.title.set(definition.title);
    this.destination.set(definition.destinationRoute);
    this.helpDestination.set(
      definition.type === 'journey' ? `/help/journeys/${key}` : `/help/topics/${key}`
    );
    const result = await this.learning.launch(key, { continue: definition.type === 'journey' });
    if (result !== 'started') this.result.set(result);
  }

  protected resultMessage(): string {
    switch (this.result()) {
      case 'permission-denied':
        return 'Your current role cannot perform every action here. You can still read the written guide.';
      case 'not-found':
        return 'We could not find that guide. Open Dukarun Guide to choose another topic.';
      case 'navigation-failed':
        return 'We could not open the task. Your work in Dukarun is not affected.';
      case 'content-unconfigured':
        return 'The interactive guide is not available yet. The written guide is ready to use.';
      default:
        return 'The interactive guide could not start. You can continue in Dukarun or read the written guide.';
    }
  }
}
