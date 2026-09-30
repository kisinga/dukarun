import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '../core/permissions.service';
import { ShopSetupCoordinator } from './shop-setup-coordinator.service';
import { ShopSetupEntryComponent } from './shop-setup-entry.component';

describe('First shop setup invitation', () => {
  async function render(authorized = true) {
    const autoOffer = signal(true);
    const setup = {
      store: { load: vi.fn().mockResolvedValue(undefined) },
      ready: signal(false),
      autoOffer,
      offered: vi.fn(async (_deferred?: boolean) => autoOffer.set(false)),
    };
    await TestBed.configureTestingModule({
      imports: [ShopSetupEntryComponent],
      providers: [
        provideRouter([]),
        { provide: PermissionsService, useValue: { has: () => authorized } },
        { provide: ShopSetupCoordinator, useValue: setup },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ShopSetupEntryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, component: fixture.componentInstance, setup };
  }

  it('offers setup without a learning service and persists Later while keeping the entry available', async () => {
    const { fixture, component, setup } = await render();
    expect(component.offerOpen()).toBe(true);
    await component.defer();
    fixture.detectChanges();
    expect(setup.offered).toHaveBeenCalledWith(true);
    expect(component.offerOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('a[href="/shop-setup"]')).not.toBeNull();
  });

  it('retains the invitation after a failed save and saves before navigating on retry', async () => {
    const { component, setup } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    setup.offered.mockRejectedValueOnce(new Error('Connection lost'));
    await component.start();
    expect(component.error()).toBe('Connection lost');
    expect(component.offerOpen()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    await component.start();
    expect(component.offerOpen()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/shop-setup');
  });

  it('does not load or offer profile setup without settings permission', async () => {
    const { fixture, component, setup } = await render(false);
    expect(component.offerOpen()).toBe(false);
    expect(setup.store.load).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
  });
});
