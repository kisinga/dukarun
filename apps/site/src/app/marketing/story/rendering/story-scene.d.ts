import type { StoryConfig } from '../story.types';

export interface StoryScene {
  selectLeaf(id: string): void;
  revealContributions(): void;
  destroy(): void;
}

/** Browser-only, scoped to one Angular component; returns complete lifecycle cleanup. */
export function createStoryScene(
  host: HTMLElement,
  config: StoryConfig,
  callbacks: { selectLeaf(id: string): void }
): StoryScene;
