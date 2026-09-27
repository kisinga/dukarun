import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { RouteNavigationComponent } from './route-navigation.component';

@Component({ template: '' })
class NavigationTestPage {}

describe('RouteNavigationComponent', () => {
  let fixture: ComponentFixture<RouteNavigationComponent>;
  let router: Router;
  const items = [
    { route: '/insights/credit', label: 'Credit' },
    { route: '/insights/inventory', label: 'Inventory' },
    { route: '/insights/sales', label: 'Sales' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouteNavigationComponent],
      providers: [provideRouter([{ path: '**', component: NavigationTestPage }])],
    }).compileComponents();
    router = TestBed.inject(Router);
    await router.navigateByUrl('/insights/inventory?view=performance');
    fixture = TestBed.createComponent(RouteNavigationComponent);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('label', 'Insights');
  });

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the active route, not the first option, on initial render', async () => {
    await render();
    expect(fixture.nativeElement.querySelector('select').value).toBe('/insights/inventory');
    expect(fixture.nativeElement.querySelector('[aria-current="page"]').textContent).toContain(
      'Inventory'
    );
  });

  it('selects the active route when permission-filtered options arrive later', async () => {
    fixture.componentRef.setInput('items', []);
    await render();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    fixture.componentRef.setInput('items', items);
    await render();
    expect(fixture.nativeElement.querySelector('select').value).toBe('/insights/inventory');
  });

  it('stays synchronized with dropdown navigation and external route changes', async () => {
    await render();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = '/insights/sales';
    select.dispatchEvent(new Event('change'));
    await render();
    expect(router.url).toBe('/insights/sales');
    expect(select.value).toBe('/insights/sales');

    await router.navigateByUrl('/insights/inventory/product-1');
    await render();
    expect(select.value).toBe('/insights/inventory');
    expect(fixture.nativeElement.querySelector('[aria-current="page"]').textContent).toContain(
      'Inventory'
    );
  });
});
