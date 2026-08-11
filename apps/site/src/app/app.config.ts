import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideIcons, provideNgIconsConfig } from '@ng-icons/core';
import {
  heroArrowRight,
  heroBanknotes,
  heroBars3,
  heroChartBar,
  heroCheck,
  heroCheckBadge,
  heroCheckCircle,
  heroClipboardDocumentList,
  heroCreditCard,
  heroCube,
  heroDevicePhoneMobile,
  heroEnvelope,
  heroLockClosed,
  heroLockOpen,
  heroPrinter,
  heroShoppingCart,
  heroShare,
  heroSignalSlash,
  heroSparkles,
  heroTruck,
  heroUserGroup,
  heroUsers,
  heroXMark,
} from '@ng-icons/heroicons/outline';
import { heroPlaySolid } from '@ng-icons/heroicons/solid';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideClientHydration(withEventReplay()),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })
    ),
    provideNgIconsConfig({ size: '1rem' }),
    provideIcons({
      heroArrowRight,
      heroBanknotes,
      heroBars3,
      heroChartBar,
      heroCheck,
      heroCheckBadge,
      heroCheckCircle,
      heroClipboardDocumentList,
      heroCreditCard,
      heroCube,
      heroDevicePhoneMobile,
      heroEnvelope,
      heroLockClosed,
      heroLockOpen,
      heroPrinter,
      heroPlaySolid,
      heroShoppingCart,
      heroShare,
      heroSignalSlash,
      heroSparkles,
      heroTruck,
      heroUserGroup,
      heroUsers,
      heroXMark,
    }),
  ],
};
