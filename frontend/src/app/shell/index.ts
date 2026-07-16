// Shell barrel — @dukarun/shell
//
// Re-exports app wiring consumed by main.ts and the router.
// Does NOT export SSR-only configuration or layout components, so that using
// this barrel from a lazy-loaded page does not drag server-rendering code or
// eager UI into the wrong chunk.

export { appConfig } from './app.config';
export { routes } from './app.routes';

export * from './guards/auth.guard';
export * from './guards/cashier.guard';
export * from './guards/credit.guard';
export * from './guards/financials.guard';
export * from './guards/product.guard';
export * from './guards/settings.guard';
export * from './guards/stock-adjustment.guard';

export * from './interceptors/subscription.interceptor';

export * from './services/app-init.service';
export * from './services/network.service';
