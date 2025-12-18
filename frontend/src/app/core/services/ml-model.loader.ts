import { Injector } from '@angular/core';
import type { MlModelService } from './ml-model/ml-model.service';

let cachedService: MlModelService | null = null;
let loadPromise: Promise<MlModelService> | null = null;

export async function loadMlModelService(injector: Injector): Promise<MlModelService> {
  if (cachedService) {
    return cachedService;
  }

  loadPromise ??= import('./ml-model/ml-model.service').then((module) =>
    injector.get(module.MlModelService),
  );
  cachedService = await loadPromise;
  return cachedService;
}
