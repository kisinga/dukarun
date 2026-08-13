import { errorMessage } from './error-message';

export interface IndependentLoadTask {
  fallback: string;
  run: () => Promise<unknown>;
  onError?: (message: string) => void;
}

/**
 * Runs unrelated reads concurrently while committing every successful result.
 * A failed optional/history request must never discard valid form-option data.
 */
export async function runIndependentLoads(
  tasks: readonly IndependentLoadTask[]
): Promise<string[]> {
  const results = await Promise.allSettled(
    tasks.map(task => Promise.resolve().then(() => task.run()))
  );
  const errors: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') return;
    const task = tasks[index];
    const message = errorMessage(result.reason, task.fallback);
    task.onError?.(message);
    errors.push(message);
  });
  return errors;
}
