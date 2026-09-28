import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';
import { bindListQuery, listFormQueryField, listQueryField } from '../shared/list/list-query';
import { OrdersComponent } from './orders.component';

// Run the real date-preset/navigation methods with fixed business dates and a real router.
@Component({ template: '' })
class SalesNavigationFixture {
  router = inject(Router);
  route = inject(ActivatedRoute);
  from = new FormControl('2026-09-28', { nonNullable: true });
  to = new FormControl('2026-09-28', { nonNullable: true });
  allTime = signal(true);
  customerId = signal<string | null>(null);
  page = signal(1);
  todayIso = () => '2026-09-28';
  daysAgoIso = () => '2026-09-22';
  apply = vi.fn(async () => undefined);
  syncHistoryFilters = OrdersComponent.prototype['syncHistoryFilters'];
  setWeek = OrdersComponent.prototype['setWeek'];
  constructor() {
    bindListQuery({
      from: listFormQueryField(this.from),
      to: listFormQueryField(this.to),
      page: listQueryField(this.page),
    });
  }
}

describe('Sales date preset navigation', () => {
  it('keeps the selected week when leaving all-time sales', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'sales', component: SalesNavigationFixture }])],
    });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/sales?range=all', SalesNavigationFixture);
    await component.setWeek();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    expect(component.from.value).toBe('2026-09-22');
    expect(component.to.value).toBe('2026-09-28');
    expect(component.apply).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).parseUrl(TestBed.inject(Router).url).queryParams).toEqual({
      from: '2026-09-22',
    });
  });
});
