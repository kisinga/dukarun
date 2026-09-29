import { describe, expect, it } from 'vitest';
import { nextShopSetupStep, shopSetupTasks } from './shop-setup-state';
import type { CompanySettings } from './settings.service';
import { suggestShopAddress, shopWebUrl } from '@dukarun/documents';
const profile = {
  name: 'Amina Shop',
  logo_path: null,
  public_slug: null,
  shop_setup: {},
} as CompanySettings;
describe('shop setup readiness', () => {
  it('resumes from saved acknowledgements, allowing optional branding and deferred web address', () => {
    expect(nextShopSetupStep(profile)).toBe(0);
    const identity = { ...profile, shop_setup: { identity_reviewed: true } };
    expect(nextShopSetupStep(identity)).toBe(1);
    const address = { ...identity, shop_setup: { ...identity.shop_setup, address_deferred: true } };
    expect(nextShopSetupStep(address)).toBe(2);
    const reviewed = {
      ...address,
      shop_setup: { ...address.shop_setup, documents_reviewed: true },
    };
    expect(nextShopSetupStep(reviewed)).toBe(3);
    expect(
      shopSetupTasks(reviewed)
        .filter(task => task.status === 'optional')
        .map(task => task.key)
    ).toEqual(['logo', 'address']);
  });
  it('uses actual saved data and does not let acknowledgements substitute for a name', () => {
    expect(
      nextShopSetupStep({
        ...profile,
        name: ' ',
        shop_setup: { identity_reviewed: true, documents_reviewed: true, address_deferred: true },
      })
    ).toBe(0);
    expect(shopSetupTasks({ ...profile, public_slug: 'amina' })[2].status).toBe('done');
  });
  it('suggests a valid address without publishing or saving it', () => {
    expect(suggestShopAddress('Amina & Sons')).toBe('amina-sons');
    expect(shopWebUrl('https://store.test/', 'amina-sons')).toBe('https://store.test/amina-sons');
    expect(profile.public_slug).toBeNull();
  });
});
