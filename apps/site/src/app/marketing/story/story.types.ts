export interface StorySource {
  readonly label: string;
  readonly url: string;
}

export interface StoryLeaf {
  readonly id: string;
  readonly persona: string;
}

export interface StoryBranch {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly nodes: readonly StoryLeaf[];
}

export interface StoryChapter {
  readonly id: string;
  readonly leaf: string;
  readonly branch: string;
  readonly date: string;
  readonly persona: string;
  readonly title: string;
  readonly intro: string;
  readonly quote?: string;
  readonly body: string;
  readonly direction: string;
  readonly context: string;
  readonly basis: string;
  readonly sources: readonly StorySource[];
  readonly related: readonly string[];
}

export interface StoryLesson {
  readonly text: string;
  readonly chapter: string;
  readonly detail: string;
}

export interface StoryConfig {
  readonly id: string;
  readonly title: string;
  readonly branches: readonly StoryBranch[];
  readonly lessons: readonly StoryLesson[];
  readonly chapters: readonly StoryChapter[];
  readonly openLabels: Readonly<Record<string, string>>;
}
