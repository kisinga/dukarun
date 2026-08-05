import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideNgIconsConfig, provideIcons } from '@ng-icons/core';
import {
  heroArchiveBox,
  heroCheckCircle,
  heroChevronLeft,
  heroPlus,
  heroXMark,
} from '@ng-icons/heroicons/outline';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    provideNgIconsConfig({ size: '1rem' }),
    provideIcons({ heroArchiveBox, heroCheckCircle, heroChevronLeft, heroPlus, heroXMark }),
  ],
};
