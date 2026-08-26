import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideIcons, provideNgIconsConfig } from '@ng-icons/core';
import {
  heroChevronRight,
  heroMinus,
  heroPlus,
  heroListBullet,
  heroQueueList,
  heroShare,
  heroShoppingBag,
  heroSquares2x2,
  heroTrash,
  heroXMark,
} from '@ng-icons/heroicons/outline';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideClientHydration(withEventReplay()),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    provideNgIconsConfig({ size: '1rem' }),
    provideIcons({
      heroChevronRight,
      heroListBullet,
      heroMinus,
      heroPlus,
      heroQueueList,
      heroShare,
      heroShoppingBag,
      heroSquares2x2,
      heroTrash,
      heroXMark,
    }),
  ],
};
