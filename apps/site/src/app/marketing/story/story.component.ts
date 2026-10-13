import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icon.component';
import { STORY_TREE_CONFIG } from './story.data';
import { createStoryScene, type StoryScene } from './rendering/story-scene';
import type { StoryChapter, StoryLeaf } from './story.types';

interface LeafAccount extends StoryLeaf {
  readonly label: string;
  readonly direction: string;
  readonly color: string;
  readonly chapter?: StoryChapter;
}

@Component({
  selector: 'app-marketing-story',
  imports: [RouterLink, IconComponent],
  templateUrl: './story.component.html',
  styleUrl: './story.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoryComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private scene: StoryScene | undefined;
  protected readonly config = STORY_TREE_CONFIG;
  protected readonly leaves: LeafAccount[] = this.config.branches.flatMap(branch =>
    branch.nodes.map(leaf => {
      const chapter = this.config.chapters.find(account => account.leaf === leaf.id);
      return {
        ...leaf,
        persona: chapter?.persona ?? leaf.persona,
        label: chapter?.title ?? this.config.openLabels[leaf.id] ?? 'A story still growing',
        direction: branch.label,
        color: branch.color,
        chapter,
      };
    })
  );
  protected readonly selectedId = signal(this.config.chapters[0].leaf);
  protected readonly selected = computed(() =>
    this.leaves.find(leaf => leaf.id === this.selectedId())!
  );
  protected readonly related = computed(() => {
    const ids = this.selected().chapter?.related ?? [];
    return this.config.chapters.filter(chapter => ids.includes(chapter.id));
  });

  constructor() {
    afterNextRender(() => {
      if (this.destroyRef.destroyed) return;
      const restoreFragment = () => {
        let fragment = location.hash.slice(1);
        try {
          fragment = decodeURIComponent(fragment);
        } catch {
          return;
        }
        const leaf =
          this.config.chapters.find(chapter => chapter.id === fragment)?.leaf ??
          this.leaves.find(leaf => leaf.id === fragment)?.id;
        if (!leaf) return;
        this.selectedId.set(leaf);
        this.changeDetector.detectChanges();
        this.scene?.selectLeaf(leaf);
      };
      restoreFragment();
      this.changeDetector.detectChanges();
      this.scene = createStoryScene(this.element.nativeElement, this.config, {
        selectLeaf: id => this.applySelection(id),
      });
      this.scene.selectLeaf(this.selectedId());
      window.addEventListener('hashchange', restoreFragment);
      this.destroyRef.onDestroy(() => window.removeEventListener('hashchange', restoreFragment));
    });
    this.destroyRef.onDestroy(() => this.scene?.destroy());
  }

  private applySelection(id: string): void {
    if (!this.leaves.some(leaf => leaf.id === id)) return;
    this.selectedId.set(id);
    this.changeDetector.detectChanges();
    const chapter = this.selected().chapter;
    history.replaceState(history.state, '', `#${chapter?.id ?? id}`);
    // Evidence from the previous account should not stay open on another person's story.
    this.element.nativeElement
      .querySelectorAll<HTMLDetailsElement>('.account-evidence')
      .forEach(detail => (detail.open = false));
  }

  protected selectLeaf(id: string): void {
    this.applySelection(id);
    this.scene?.selectLeaf(id);
  }

  protected selectChapter(id: string, event?: Event): void {
    event?.preventDefault();
    const leaf = this.config.chapters.find(chapter => chapter.id === id)?.leaf;
    if (!leaf) return;
    this.selectLeaf(leaf);
    this.scene?.revealContributions();
  }

  protected changeSelection(event: Event): void {
    this.selectLeaf((event.target as HTMLSelectElement).value);
  }
}
