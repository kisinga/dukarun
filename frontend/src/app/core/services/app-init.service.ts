import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { ApolloService } from './apollo.service';
import { CacheSyncService } from './cache/cache-sync.service';
import { CompanyService } from './company.service';
import { CustomerSearchService } from './customer/customer-search.service';
import { loadMlModelService } from './ml-model.loader';
import type { MlModelService } from './ml-model/ml-model.service';
import { ModelErrorType } from './ml-model/model-error.util';
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
  modelLoaded: boolean;
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
  private readonly injector = inject(Injector);
  /** Injected so CacheSyncService is created and starts SSE when user has a channel */
  private readonly cacheSyncService = inject(CacheSyncService);
  private mlModelService: MlModelService | null = null;

  private readonly initStatusSignal = signal<InitStatus>({
    productsLoaded: false,
    modelLoaded: false,
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
        this.prefetchModel(channelId),
        this.prefetchStockLocations(),
        this.prefetchNotifications(),
        this.prefetchPaymentMethods(),
        this.prefetchCustomers(),
        this.prefetchSuppliers(),
      ]);
      const [productsSuccess, modelSuccess, locationsSuccess, notificationsSuccess] = settled;

      // Update status based on results
      this.initStatusSignal.update((s) => ({
        ...s,
        productsLoaded: productsSuccess.status === 'fulfilled' && productsSuccess.value,
        modelLoaded: modelSuccess.status === 'fulfilled' && modelSuccess.value,
        locationsLoaded: locationsSuccess.status === 'fulfilled' && locationsSuccess.value,
        notificationsLoaded:
          notificationsSuccess.status === 'fulfilled' && notificationsSuccess.value,
        error:
          productsSuccess.status === 'rejected' ||
          modelSuccess.status === 'rejected' ||
          locationsSuccess.status === 'rejected' ||
          notificationsSuccess.status === 'rejected'
            ? 'Some features failed to initialize'
            : null,
      }));

      const status = this.initStatusSignal();
      if (
        status.productsLoaded &&
        status.modelLoaded &&
        status.locationsLoaded &&
        status.notificationsLoaded
      ) {
        console.log('✅ Dashboard initialized');
      } else if (status.productsLoaded && status.locationsLoaded && status.notificationsLoaded) {
        console.log('⚠️ Dashboard initialized (ML unavailable)');
      } else {
        console.error('❌ Dashboard initialization incomplete');
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
   * Pre-load ML model for instant camera scanning
   */
  private async prefetchModel(channelId: string): Promise<boolean> {
    try {
      // Check if model exists first
      const mlModelService = await this.ensureMlModelService();
      const exists = await mlModelService.checkModelExists(channelId);
      if (!exists.exists) {
        console.warn('⚠️ ML model not available:', exists.error?.message || 'Model not configured');
        return false;
      }

      const loaded = await mlModelService.loadModel(channelId);

      // If loadModel returned false, check if it's a NOT_FOUND error (expected) or unexpected
      if (!loaded) {
        const error = mlModelService.error();
        if (error?.type === ModelErrorType.NOT_FOUND) {
          // Model not configured - this is expected, use warning
          console.warn('⚠️ ML model not available:', error.message);
        } else if (error) {
          // Other errors (network, load errors) - log as error
          console.error('❌ Failed to load ML model:', error.message);
        }
      }

      return loaded;
    } catch (error: any) {
      // Only unexpected errors reach here (e.g., service initialization failures)
      console.error('❌ Failed to prefetch ML model:', error);
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
    this.mlModelService?.unloadModel();
    this.stockLocationService.clearLocations();
    this.isInitializingSignal.set(false);
    this.lastInitChannelId.set(null);
    this.initStatusSignal.set({
      productsLoaded: false,
      modelLoaded: false,
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

  /**
   * Check if ML features are available
   */
  isMLReady(): boolean {
    return this.initStatusSignal().modelLoaded;
  }

  private async ensureMlModelService(): Promise<MlModelService> {
    if (this.mlModelService) {
      return this.mlModelService;
    }

    const service = await loadMlModelService(this.injector);
    this.mlModelService = service;
    return service;
  }
}
