import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ShopProfileComponent } from './shop-profile.component';
import { CompanySettingsStore } from './company-settings.store';

describe('shared shop profile form', () => {
  async function render() {
    const profile = signal({
      id: 'one',
      name: 'Registered shop',
      address: 'Market Road',
      email: 'hello@example.test',
      public_whatsapp_number: null,
      website_url: null,
      logo_path: null,
    });
    const store = {
      settings: profile,
      loading: signal(false),
      error: signal(null),
      load: vi.fn(async () => profile()),
      update: vi.fn(async patch => profile.update(s => ({ ...s, ...patch }))),
      uploadLogo: vi.fn().mockResolvedValue('one/new-logo.png'),
      removeLogo: vi.fn(),
      logoPublicUrl: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [ShopProfileComponent],
      providers: [{ provide: CompanySettingsStore, useValue: store }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ShopProfileComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, store };
  }
  it('prefills registration details and retains entries after a failed save', async () => {
    const { component, store } = await render();
    expect(component.name.value).toBe('Registered shop');
    expect(component.address.value).toBe('Market Road');
    component.name.setValue('My changed shop');
    component.name.markAsDirty();
    store.update.mockRejectedValueOnce(new Error('Offline'));
    await component.save();
    expect(component.name.value).toBe('My changed shop');
    expect(component.dirty()).toBe(true);
    expect(component.error()).toBe('Offline');
    await component.save();
    expect(component.dirty()).toBe(false);
    expect(store.settings().name).toBe('My changed shop');
  });
  it('retains a failed logo upload for retry, without requiring another file selection', async () => {
    const { component, store } = await render();
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', {
      type: 'image/svg+xml',
    });
    Object.defineProperty(file, 'text', {
      value: async () => '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
    store.uploadLogo.mockRejectedValueOnce(new Error('Upload interrupted'));
    await component.selectLogo({
      target: { files: [file], value: 'logo.svg' },
    } as unknown as Event);
    expect(component.pendingLogo).toBe(file);
    expect(component.logoError()).toBe('Upload interrupted');
    await component.uploadLogo();
    expect(store.uploadLogo).toHaveBeenCalledTimes(2);
    expect(component.pendingLogo).toBeNull();
    expect(store.uploadLogo).toHaveBeenLastCalledWith(file, 'svg');
  });
  it('rejects external SVG images before saving a logo that cannot render on receipts', async () => {
    const { component, store } = await render();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.test/logo.png"/></svg>';
    const file = new File([svg], 'logo.svg', { type: 'image/svg+xml' });
    Object.defineProperty(file, 'text', { value: async () => svg });
    await component.selectLogo({
      target: { files: [file], value: 'logo.svg' },
    } as unknown as Event);
    expect(store.uploadLogo).not.toHaveBeenCalled();
    expect(component.logoError()).toContain('embedded PNG or JPEG');
  });
  it('accepts local SVG filters using the receipt rendering policy', async () => {
    const { component, store } = await render();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><defs><filter id="shadow"><feGaussianBlur stdDeviation="1"/></filter></defs><rect width="40" height="40" filter="url(#shadow)"/></svg>';
    const file = new File([svg], 'logo.svg', { type: 'image/svg+xml' });
    Object.defineProperty(file, 'text', { value: async () => svg });
    await component.selectLogo({
      target: { files: [file], value: 'logo.svg' },
    } as unknown as Event);
    expect(component.logoError()).toBeNull();
    expect(store.uploadLogo).toHaveBeenCalledWith(file, 'svg');
  });
});
