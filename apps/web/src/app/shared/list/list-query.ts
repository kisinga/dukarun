import { toSignal } from '@angular/core/rxjs-interop';
import type { FormControl } from '@angular/forms';
import { DestroyRef, WritableSignal, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

export interface ListQueryField {
  read(): string | null;
  restore(value: string | null): void;
}

/** Keep existing parameter names at the call site; defaults stay out of shared URLs. */
export function listQueryField<T extends string | number | boolean | null>(
  state: WritableSignal<T>,
  options: { values?: readonly T[]; max?: number } = {}
): ListQueryField {
  const initial = state();
  return {
    read: () => (state() === initial ? null : String(state())),
    restore: value => {
      let parsed: string | number | boolean | null = value ?? initial;
      if (typeof initial === 'number') {
        const number = Number(value);
        parsed =
          value !== null && Number.isInteger(number) && number > 0
            ? Math.min(number, options.max ?? 100000)
            : initial;
      }
      if (typeof initial === 'boolean') parsed = value === null ? initial : value === 'true';
      if (options.values && !options.values.includes(parsed as T)) parsed = initial;
      if (state() !== parsed) state.set(parsed as T);
    },
  };
}

/** A per-list URL binding, with normal Angular route lifecycle and no route reuse. */
export function bindListQuery(
  fields: Record<string, ListQueryField>,
  onHistoryChange?: () => void
): void {
  const route = inject(ActivatedRoute, { optional: true }),
    router = inject(Router, { optional: true }),
    destroy = inject(DestroyRef);
  if (!route || !router) return;
  let previousParams = route.snapshot.queryParamMap;
  untracked(() => {
    for (const [key, field] of Object.entries(fields)) field.restore(previousParams.get(key));
  });
  const subscription = route.queryParamMap.subscribe(params => {
    // Domain navigation (opening a drawer, changing a date preset) can happen
    // before the effect writes pending list edits. Only restore fields whose URL changed.
    const changed = Object.entries(fields).filter(
      ([key]) => params.get(key) !== previousParams.get(key)
    );
    previousParams = params;
    if (!changed.length) return;
    untracked(() => {
      for (const [key, field] of changed) field.restore(params.get(key));
    });
    if (router.getCurrentNavigation()?.trigger === 'popstate') onHistoryChange?.();
  });
  destroy.onDestroy(() => subscription.unsubscribe());
  effect(() => {
    const params = Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [key, field.read()])
    );
    untracked(() => {
      const tree = router.createUrlTree([], {
        relativeTo: route,
        queryParams: params,
        queryParamsHandling: 'merge',
      });
      if (tree.toString() !== router.url) void router.navigateByUrl(tree, { replaceUrl: true });
    });
  });
}

export function listFormQueryField(control: FormControl<string>): ListQueryField {
  const initial = control.value;
  const value = toSignal(control.valueChanges, { initialValue: initial });
  return {
    read: () => (value() === initial ? null : value()),
    restore: next => {
      if (control.value !== (next ?? initial)) control.setValue(next ?? initial);
    },
  };
}
