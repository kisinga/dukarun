import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { describe, expect, it, vi } from 'vitest';
import { bindListQuery, listQueryField } from './list-query';

@Component({ template: `<p>{{ search() }} · {{ page() }}</p>` })
class ListFixture {
  search = signal('');
  page = signal(1);
  sort = signal('date');
  constructor() {
    bindListQuery({
      search: listQueryField(this.search),
      page: listQueryField(this.page, { max: 100 }),
      sort: listQueryField(this.sort, { values: ['date', 'name'] }),
    });
  }
}

@Component({ template: '' })
class HistoryListFixture {
  search = signal('');
  page = signal(1);
  historyChanged = vi.fn();
  constructor() {
    bindListQuery(
      { search: listQueryField(this.search), page: listQueryField(this.page) },
      this.historyChanged
    );
  }
}

describe('List query binding', () => {
  it('restores shared view state and writes changes without losing domain deep links', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'list', component: ListFixture }])],
    });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(
      '/list?search=tea&page=3&order=sale-1',
      ListFixture
    );
    expect(component.search()).toBe('tea');
    expect(component.page()).toBe(3);
    component.search.set('milk & tea');
    component.page.set(1);
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    const params = TestBed.inject(Router).parseUrl(TestBed.inject(Router).url).queryParams;
    expect(params).toEqual({ search: 'milk & tea', order: 'sale-1' });
    await harness.navigateByUrl('/list?search=coffee&page=2', ListFixture);
    expect(component.search()).toBe('coffee');
    expect(component.page()).toBe(2);
  });

  it('rejects invalid pages and unavailable sort choices', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'list', component: ListFixture }])],
    });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/list?page=-5&sort=private', ListFixture);
    expect(component.page()).toBe(1);
    expect(component.sort()).toBe('date');
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/list');
  });

  it('restores removed fields to their defaults on navigation', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'list', component: ListFixture }])],
    });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/list?search=tea&page=3&sort=name', ListFixture);
    await harness.navigateByUrl('/list?order=sale-1', ListFixture);
    expect(component.search()).toBe('');
    expect(component.page()).toBe(1);
    expect(component.sort()).toBe('date');
  });

  it('restores saved views and calls the loader on browser Back and Forward', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'list', component: HistoryListFixture }]),
        provideLocationMocks(),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/list?search=tea&page=3', HistoryListFixture);
    // The harness navigates directly without the application's bootstrap listener.
    TestBed.inject(Router).initialNavigation();
    await harness.navigateByUrl('/list?search=coffee&page=2', HistoryListFixture);
    expect(component.historyChanged).not.toHaveBeenCalled();
    const location = TestBed.inject(Location);
    location.back();
    await vi.waitFor(() => expect(component.historyChanged).toHaveBeenCalledTimes(1));
    expect(component.search()).toBe('tea');
    expect(component.page()).toBe(3);
    location.forward();
    await vi.waitFor(() => expect(component.historyChanged).toHaveBeenCalledTimes(2));
    expect(component.search()).toBe('coffee');
    expect(component.page()).toBe(2);
  });
});
