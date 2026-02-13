/**
 * ProductsComponent tests for sensitive actions and cache overrides.
 * Ensures post-delete refetch uses network-only and refresh param triggers network-only and is cleared.
 */

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductService } from '../../../core/services/product.service';
import { FacetService } from '../../../core/services/product/facet.service';
import { AuthService } from '../../../core/services/auth.service';
import { ProductsComponent } from './products.component';

describe('ProductsComponent (sensitive actions and cache)', () => {
  let component: ProductsComponent;
  let fixture: ComponentFixture<ProductsComponent>;
  let productService: jasmine.SpyObj<Pick<ProductService, 'fetchProducts' | 'deleteProduct'>>;
  let router: jasmine.SpyObj<Pick<Router, 'navigate'>>;
  let routeSnapshot: Record<string, string | null>;

  beforeEach(async () => {
    routeSnapshot = {};
    productService = jasmine.createSpyObj('ProductService', ['fetchProducts', 'deleteProduct']);
    productService.fetchProducts.and.returnValue(Promise.resolve());
    productService.deleteProduct.and.returnValue(Promise.resolve(true));
    (productService as any).products = signal([]);
    (productService as any).isLoading = signal(false);
    (productService as any).error = signal(null);
    (productService as any).totalItems = signal(0);

    const facetService = jasmine.createSpyObj('FacetService', ['getManufacturerIdsMatchingName']);
    facetService.getManufacturerIdsMatchingName.and.returnValue(Promise.resolve([]));

    const authService = {
      hasUpdateProductPermission: signal(true),
    };

    router = jasmine.createSpyObj('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));

    await TestBed.configureTestingModule({
      imports: [ProductsComponent],
      providers: [
        { provide: ProductService, useValue: productService },
        { provide: FacetService, useValue: facetService },
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams: routeSnapshot as any },
            queryParams: { subscribe: (fn: (v: any) => void) => fn({}) },
          },
        },
      ],
    })
      .overrideComponent(ProductsComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(ProductsComponent);
    component = fixture.componentInstance;
    // Let constructor effect run one time; loadProducts is called with no refresh
    await fixture.whenStable();
    productService.fetchProducts.calls.reset();
    router.navigate.calls.reset();
  });

  it('should call fetchProducts with network-only when onDeleteConfirmed and delete succeeds', async () => {
    component.productToDelete.set('product-1');
    await component.onDeleteConfirmed();

    expect(productService.deleteProduct).toHaveBeenCalledWith('product-1');
    expect(productService.fetchProducts).toHaveBeenCalledWith(jasmine.anything(), {
      fetchPolicy: 'network-only',
    });
  });

  it('should call fetchProducts with network-only when loadProducts is called with forceRefresh true', async () => {
    await component.loadProducts(true);

    expect(productService.fetchProducts).toHaveBeenCalledWith(jasmine.anything(), {
      fetchPolicy: 'network-only',
    });
  });

  it('should use network-only and clear refresh param when route has refresh=1', async () => {
    routeSnapshot['refresh'] = '1';
    await component.loadProducts();

    expect(productService.fetchProducts).toHaveBeenCalledWith(jasmine.anything(), {
      fetchPolicy: 'network-only',
    });
    expect(router.navigate).toHaveBeenCalledWith([], {
      queryParams: { refresh: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });
});
