import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideNgIconsConfig, provideIcons } from '@ng-icons/core';
import {
  heroArchiveBox,
  heroArrowPath,
  heroArrowRightOnRectangle,
  heroBars3,
  heroBuildingOffice2,
  heroChartBar,
  heroChatBubbleLeftRight,
  heroCheckCircle,
  heroChevronLeft,
  heroChevronRight,
  heroClipboardDocumentList,
  heroDocumentText,
  heroHome,
  heroMagnifyingGlass,
  heroMoon,
  heroNewspaper,
  heroPlus,
  heroServerStack,
  heroShieldCheck,
  heroSun,
  heroXMark,
} from '@ng-icons/heroicons/outline';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    provideNgIconsConfig({ size: '1rem' }),
    provideIcons({
      heroArchiveBox,
      heroArrowPath,
      heroArrowRightOnRectangle,
      heroBars3,
      heroBuildingOffice2,
      heroChartBar,
      heroChatBubbleLeftRight,
      heroCheckCircle,
      heroChevronLeft,
      heroChevronRight,
      heroClipboardDocumentList,
      heroDocumentText,
      heroHome,
      heroMagnifyingGlass,
      heroMoon,
      heroNewspaper,
      heroPlus,
      heroServerStack,
      heroShieldCheck,
      heroSun,
      heroXMark,
    }),
  ],
};
