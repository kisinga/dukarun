import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { CompanyService } from './company.service';
import { loadMlModelService } from './ml-model.loader';
import type { MlModelService } from './ml-model/ml-model.service';
import { ModelErrorType } from './ml-model/model-error.util';
import { NotificationService } from './notification.service';
import { ProductCacheService } from './product/product-cache.service';
import { StockLocationService } from './stock-location.service';

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
  private readonly companyService = inject(CompanyService);
  private readonly productCacheService = inject(ProductCacheService);
  private readonly stockLocationService = inject(StockLocationService);
  private readonly notificationService = inject(NotificationService);
  private readonly injector = inject(Injector);
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
      // Run prefetch operations in parallel
      const [productsSuccess, modelSuccess, locationsSuccess, notificationsSuccess] =
        await Promise.allSettled([
          this.prefetchProducts(channelId),
          this.prefetchModel(channelId),
          this.prefetchStockLocations(),
          this.prefetchNotifications(),
        ]);

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
      await this.notificationService.loadNotifications();
      await this.notificationService.loadUnreadCount();
      return true;
    } catch (error: any) {
      console.error('Failed to prefetch notifications:', error);
      return false;
    }
  }

  /**
   * Clear all cached data (on logout or channel switch)
   */
  clearCache(): void {
    this.productCacheService.clearCache();
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
