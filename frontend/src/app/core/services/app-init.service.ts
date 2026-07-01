import { Injectable, computed, inject, signal } from '@angular/core';
import { ApolloService } from './apollo.service';
import { CacheSyncService } from './cache/cache-sync.service';
import { CashierSessionService } from './cashier-session/cashier-session.service';
import { CompanyService } from './company.service';
import { CustomerSearchService } from './customer/customer-search.service';
import { NotificationService } from './notification.service';
import { NotificationStateService } from './notification/notification-state.service';
import { PaymentMethodService } from './payment-method.service';
import { ProductCacheService } from './product/product-cache.service';
import { SalesSyncGuardService } from './sales-sync-guard.service';
import { StockLocationService } from './stock-location.service';
import { SupplierSearchService } from './supplier/supplier-search.service';

/**
 * Initialization status for dashboard boot
 */
export interface InitStatus {
  productsLoaded: boolean;
  locationsLoaded: boolean;
  notificationsLoaded: boolean;
  channelId: string | null;
  error: string | null;
}

/**
 * App initialization service
 * Orchestrates boot-time data loading for offline-first operation
 */
@Injectable({
  providedIn: 'root',
})
export class AppInitService {
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);
  private readonly productCacheService = inject(ProductCacheService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  private readonly customerSearchService = inject(CustomerSearchService);
  private readonly supplierSearchService = inject(SupplierSearchService);
  private readonly salesSyncGuard = inject(SalesSyncGuardService);
  private readonly stockLocationService = inject(StockLocationService);
  private readonly notificationService = inject(NotificationService);
  private readonly notificationStateService = inject(NotificationStateService);
  /** Injected so CacheSyncService is created and starts SSE when user has a channel */
  private readonly cacheSyncService = inject(CacheSyncService);
  private readonly cashierSessionService = inject(CashierSessionService);

  private readonly initStatusSignal = signal<InitStatus>({
    productsLoaded: false,
    locationsLoaded: false,
    notificationsLoaded: false,
    channelId: null,
    error: null,
  });

  private readonly isInitializingSignal = signal<boolean>(false);
  private readonly lastInitChannelId = signal<string | null>(null);

  readonly initStatus = this.initStatusSignal.asReadonly();

  /**
   * Whether locations are loaded and ready for use
   * Use this to gate UI that requires a location (e.g., product creation)
   */
  readonly isReady = computed(() => this.initStatusSignal().locationsLoaded);

  /**
   * Whether initialization is currently in progress
   */
  readonly isInitializing = this.isInitializingSignal.asReadonly();

  /**
   * Initialize dashboard data when channel is set
   * Idempotent: prevents duplicate initialization for same channel
   */
  async initializeDashboard(channelId: string): Promise<void> {
    // Prevent duplicate initialization
    if (this.isInitializingSignal() || this.lastInitChannelId() === channelId) {
      return;
    }

    this.isInitializingSignal.set(true);
    this.lastInitChannelId.set(channelId);
    this.initStatusSignal.update((s) => ({ ...s, channelId, error: null }));

    try {
      // Run prefetch operations in parallel (payment methods, customers, suppliers populate cache for sell/checkout)
      const settled = await Promise.allSettled([
        this.prefetchProducts(channelId),
        this.prefetchStockLocations(),
        this.prefetchNotifications(),
        this.prefetchPaymentMethods(),
        this.prefetchCustomers(),
        this.prefetchSuppliers(),
      ]);
      const [productsSuccess, locationsSuccess, notificationsSuccess] = settled;

      // Update status based on results
      this.initStatusSignal.update((s) => ({
        ...s,
        productsLoaded: productsSuccess.status === 'fulfilled' && productsSuccess.value,
        locationsLoaded: locationsSuccess.status === 'fulfilled' && locationsSuccess.value,
        notificationsLoaded:
          notificationsSuccess.status === 'fulfilled' && notificationsSuccess.value,
        error:
          productsSuccess.status === 'rejected' ||
          locationsSuccess.status === 'rejected' ||
          notificationsSuccess.status === 'rejected'
            ? 'Some features failed to initialize'
            : null,
      }));

      const status = this.initStatusSignal();
      if (status.productsLoaded && status.locationsLoaded && status.notificationsLoaded) {
        console.log('✅ Dashboard initialized');
      } else {
        console.error('❌ Dashboard initialization incomplete');
      }

      // Load current cashier session so shift open/close badge is correct without visiting Overview
      const channelIdNum = parseInt(channelId, 10);
      if (!Number.isNaN(channelIdNum)) {
        this.cashierSessionService.getCurrentSession(channelIdNum).subscribe();
      }
    } finally {
      this.isInitializingSignal.set(false);
    }
  }

  /**
   * Pre-fetch all products for offline access
   */
  private async prefetchProducts(channelId: string): Promise<boolean> {
    try {
      return await this.productCacheService.prefetchChannelProducts(channelId);
    } catch (error: any) {
      console.error('Failed to prefetch products:', error);
      return false;
    }
  }

  /**
   * Pre-fetch stock locations on boot
   */
  private async prefetchStockLocations(): Promise<boolean> {
    try {
      await this.stockLocationService.fetchStockLocations();
      return this.stockLocationService.locations().length > 0;
    } catch (error: any) {
      console.error('Failed to prefetch stock locations:', error);
      return false;
    }
  }

  /**
   * Pre-fetch notifications on boot
   */
  private async prefetchNotifications(): Promise<boolean> {
    try {
      await this.notificationService.loadAll();
      return true;
    } catch (error: any) {
      console.error('Failed to prefetch notifications:', error);
      return false;
    }
  }

  /**
   * Pre-fetch payment methods for checkout/sell (populates AppCacheService)
   */
  private async prefetchPaymentMethods(): Promise<boolean> {
    try {
      await this.paymentMethodService.getPaymentMethods();
      return true;
    } catch (error: any) {
      console.warn('Failed to prefetch payment methods:', error?.message ?? error);
      return false;
    }
  }

  /**
   * Pre-fetch customers for sell/customer list (populates AppCacheService)
   */
  private async prefetchCustomers(): Promise<boolean> {
    try {
      await this.customerSearchService.fetchCustomers();
      return true;
    } catch (error: any) {
      console.warn('Failed to prefetch customers:', error?.message ?? error);
      return false;
    }
  }

  /**
   * Pre-fetch suppliers for purchase flows (populates AppCacheService)
   */
  private async prefetchSuppliers(): Promise<boolean> {
    try {
      await this.supplierSearchService.fetchSuppliers();
      return true;
    } catch (error: any) {
      console.warn('Failed to prefetch suppliers:', error?.message ?? error);
      return false;
    }
  }

  /**
   * Clear all cached data (on logout or channel switch)
   */
  clearCache(): void {
    this.notificationStateService.clear();
    this.apolloService.clearCache();
    this.productCacheService.clearCache(this.lastInitChannelId() ?? undefined);
    this.salesSyncGuard.markSynced();
    this.stockLocationService.clearLocations();
    this.isInitializingSignal.set(false);
    this.lastInitChannelId.set(null);
    this.initStatusSignal.set({
      productsLoaded: false,
      locationsLoaded: false,
      notificationsLoaded: false,
      channelId: null,
      error: null,
    });
  }

  /**
   * Switch to a new channel - clears cache then initializes
   * Use this when switching companies to ensure clean state
   */
  async reinitialize(channelId: string): Promise<void> {
    this.clearCache();
    await this.initializeDashboard(channelId);
  }

  /**
   * Check if initialization is complete
   */
  isInitialized(): boolean {
    const status = this.initStatusSignal();
    return status.productsLoaded && status.channelId !== null;
  }
}
