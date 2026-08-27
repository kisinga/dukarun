import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { CompanyPreferencesService } from '../core/company-preferences.service';
import { LocationContextService } from '../core/location-context.service';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService } from '../core/supabase.service';
import { TaxService } from '../core/tax.service';
import { PosService } from '../pos/pos.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { ProductEditorStore } from './product-editor.store';

describe('ProductEditorStore', () => {
  function createStore() {
    const pos = {
      variantsForProduct: vi.fn().mockResolvedValue([]),
      productCategoryIds: vi.fn().mockResolvedValue([]),
      upsertManufacturer: vi.fn().mockResolvedValue('manufacturer-1'),
      createProductWithVariants: vi.fn().mockResolvedValue('product-1'),
      updateProductWithVariants: vi.fn().mockResolvedValue('product-1'),
      setProductCategories: vi.fn().mockResolvedValue(undefined),
      uploadProductImage: vi.fn().mockResolvedValue('products/photo.webp'),
      updateProduct: vi.fn().mockResolvedValue('product-1'),
      removeProductImage: vi.fn().mockResolvedValue(undefined),
      imageUrl: vi.fn((path: string) => `https://images.test/${path}`),
    };
    const tax = {
      settings: vi.fn().mockResolvedValue({ categories: [] }),
      setProductCategory: vi.fn().mockResolvedValue(undefined),
    };
    const catalog = {
      manufacturers: signal([]),
      categories: signal([]),
      categoryMembershipsComplete: signal(true),
      catalog: signal([]),
      stock: signal(new Map()),
    };

    TestBed.configureTestingModule({
      providers: [
        ProductEditorStore,
        { provide: PosService, useValue: pos },
        { provide: TaxService, useValue: tax },
        { provide: SupabaseService, useValue: { claims: () => ({ company_id: 'company-1' }) } },
        { provide: CatalogCacheService, useValue: catalog },
        {
          provide: LocationContextService,
          useValue: {
            activeId: signal('location-1'),
            locations: signal([{ id: 'location-1', name: 'Main shop' }]),
          },
        },
        {
          provide: CompanyPreferencesService,
          useValue: { batchExpiryEnabled: signal(true) },
        },
        { provide: PermissionsService, useValue: { has: () => true } },
        { provide: ConnectivityService, useValue: { online: signal(true) } },
      ],
    });
    return { store: TestBed.inject(ProductEditorStore), pos, tax };
  }

  it('applies variant intents immutably and builds the coupled create payload', async () => {
    const { store, pos } = createStore();
    await store.initialize({ mode: 'create' });
    const original = store.rows()[0];

    store.name.setValue('Fresh milk');
    store.manufacturer.setValue('Dairy Co');
    store.mutateRow({
      index: 0,
      changes: { name: '500 ml', price: '120', sku: 'MILK-500' },
    });
    const result = await store.save();

    expect(original.price).toBe('');
    expect(store.rows()[0]).not.toBe(original);
    expect(pos.upsertManufacturer).toHaveBeenCalledWith('Dairy Co');
    expect(pos.createProductWithVariants).toHaveBeenCalledWith({
      name: 'Fresh milk',
      barcode: undefined,
      manufacturer_id: 'manufacturer-1',
      variants: [
        expect.objectContaining({
          name: '500 ml',
          price: 120,
          sku: 'MILK-500',
          track_inventory: true,
        }),
      ],
    });
    expect(result).toMatchObject({
      productId: 'product-1',
      mode: 'created',
      variantCount: 1,
    });
  });

  it('reports photo partial success and removes an uploaded file when metadata persistence fails', async () => {
    const { store, pos } = createStore();
    pos.updateProduct.mockRejectedValueOnce(new Error('metadata failed'));
    await store.initialize({ mode: 'create' });
    store.name.setValue('Bread');
    store.mutateRow({ index: 0, changes: { price: '80' } });
    await store.selectImage({
      blob: new Blob(['image'], { type: 'image/webp' }),
      extension: 'webp',
      previewUrl: 'blob:preview',
    });

    const result = await store.save();

    expect(result?.photoWarning).toContain('photo could not be uploaded');
    expect(pos.createProductWithVariants).toHaveBeenCalledOnce();
    expect(pos.removeProductImage).toHaveBeenCalledWith('products/photo.webp');
  });

  it('retains dirty state after immutable edits until a successful save', async () => {
    const { store } = createStore();
    await store.initialize({ mode: 'create' });
    expect(store.isDirty()).toBe(false);

    store.mutateRow({ index: 0, changes: { price: '45' } });
    expect(store.isDirty()).toBe(true);

    store.name.setValue('Water');
    await store.save();
    expect(store.isDirty()).toBe(false);
  });
});
