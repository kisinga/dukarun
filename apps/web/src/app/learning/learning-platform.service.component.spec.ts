import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../environments/environment';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService } from '../core/supabase.service';
import { LEARNING_CONTENT_REGISTRY } from './learning-content';
import { LearningPlatformService, USERTOUR_CLIENT } from './learning-platform.service';

const usertour = {
  init: vi.fn(),
  disableEvalJs: vi.fn(),
  setBaseZIndex: vi.fn(),
  setTargetMissingSeconds: vi.fn(),
  setUrlFilter: vi.fn(),
  setCustomNavigate: vi.fn(),
  identify: vi.fn().mockResolvedValue(undefined),
  group: vi.fn().mockResolvedValue(undefined),
  start: vi.fn().mockResolvedValue(undefined),
  track: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
};

const userId = '123e4567-e89b-42d3-a456-426614174000';
const companyId = '123e4567-e89b-42d3-a456-426614174001';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('LearningPlatformService', () => {
  const originalToken = environment.usertourToken;
  const originalProductId = LEARNING_CONTENT_REGISTRY['creating-a-product'].usertourContentId;
  const originalJourneyId = LEARNING_CONTENT_REGISTRY['first-business-cycle'].usertourContentId;

  beforeEach(() => {
    environment.usertourToken = 'public-environment-token';
    LEARNING_CONTENT_REGISTRY['creating-a-product'].usertourContentId = 'flow-product';
    LEARNING_CONTENT_REGISTRY['first-business-cycle'].usertourContentId = 'checklist-cycle';
    for (const method of Object.values(usertour)) {
      if (typeof method === 'function' && 'mockClear' in method) method.mockClear();
    }
    usertour.identify.mockResolvedValue(undefined);
    usertour.group.mockResolvedValue(undefined);
    usertour.start.mockResolvedValue(undefined);
    usertour.track.mockResolvedValue(undefined);
  });

  afterEach(() => {
    environment.usertourToken = originalToken;
    LEARNING_CONTENT_REGISTRY['creating-a-product'].usertourContentId = originalProductId;
    LEARNING_CONTENT_REGISTRY['first-business-cycle'].usertourContentId = originalJourneyId;
    TestBed.resetTestingModule();
  });

  function setup(hasPermission = true) {
    const identity = signal<{ userId: string; companyId: string } | null>({ userId, companyId });
    const ready = signal(false);
    const permissions = {
      ready,
      ensureLoaded: vi.fn(async () => {
        ready.set(true);
        return true;
      }),
      has: vi.fn(() => hasPermission),
    };
    const invoke = vi.fn(async () => ({
      data: { token: 'signed-token', companyId: identity()?.companyId },
      error: null,
    }));
    const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      providers: [
        LearningPlatformService,
        { provide: USERTOUR_CLIENT, useValue: usertour },
        { provide: Router, useValue: router },
        { provide: PermissionsService, useValue: permissions },
        {
          provide: SupabaseService,
          useValue: { offlineIdentity: identity, client: { functions: { invoke } } },
        },
      ],
    });
    return {
      service: TestBed.inject(LearningPlatformService),
      identity,
      permissions,
      router,
      invoke,
    };
  }

  it('initializes the hardened SDK with signed user and company identity', async () => {
    const { service, invoke } = setup();

    await expect(service.initialize()).resolves.toBe(true);

    expect(usertour.init).toHaveBeenCalledWith('public-environment-token');
    expect(usertour.disableEvalJs).toHaveBeenCalledOnce();
    expect(usertour.setBaseZIndex).toHaveBeenCalledWith(1_000_000);
    expect(usertour.setTargetMissingSeconds).toHaveBeenCalledWith(2);
    expect(usertour.setUrlFilter).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('usertour-identity', { timeout: 4_000 });
    expect(usertour.identify).toHaveBeenCalledWith(userId, {}, { token: 'signed-token' });
    await vi.waitFor(() => {
      expect(usertour.group).toHaveBeenCalledWith(
        companyId,
        {},
        expect.objectContaining({ token: 'signed-token' })
      );
    });
  });

  it('preloads the SDK before the first guide launch', () => {
    setup();

    expect(usertour.init).toHaveBeenCalledWith('public-environment-token');
    expect(usertour.disableEvalJs).toHaveBeenCalledOnce();
  });

  it('keeps production-authored guide destinations in the local app router', async () => {
    const { service, router } = setup();
    await service.initialize();
    const customNavigate = usertour.setCustomNavigate.mock.calls.at(-1)?.[0] as
      ((url: string) => void) | undefined;

    customNavigate?.('https://app.dukarun.com/inventory/products');

    expect(router.navigateByUrl).toHaveBeenCalledWith('/inventory/products');
  });

  it('uses explicit destinations and resumes journeys', async () => {
    const { service, router } = setup();

    await expect(service.launch('creating-a-product')).resolves.toBe('started');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/inventory/products');
    await vi.waitFor(() => {
      expect(usertour.start).toHaveBeenCalledWith('flow-product', { continue: false });
    });

    await expect(service.launch('first-business-cycle')).resolves.toBe('started');
    expect(router.navigateByUrl).toHaveBeenLastCalledWith('/dashboard');
    await vi.waitFor(() => {
      expect(usertour.start).toHaveBeenLastCalledWith('checklist-cycle', { continue: true });
    });
  });

  it('starts explicit content before sending nonessential company metadata', async () => {
    const callOrder: string[] = [];
    usertour.start.mockImplementationOnce(async () => {
      callOrder.push('start');
    });
    usertour.group.mockImplementationOnce(async () => {
      callOrder.push('group');
    });
    const { service } = setup();

    await expect(service.launch('creating-a-product')).resolves.toBe('started');
    await vi.waitFor(() => expect(callOrder).toContain('group'));

    expect(callOrder).toEqual(['start', 'group']);
  });

  it('opens the task before waiting for the external guide services', async () => {
    const { service, router, invoke } = setup();
    const pending = deferred<{
      data: { token: string; companyId: string };
      error: null;
    }>();
    invoke.mockImplementationOnce(() => pending.promise);

    await expect(service.launch('creating-a-product')).resolves.toBe('started');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/inventory/products');
    expect(usertour.start).not.toHaveBeenCalled();

    pending.resolve({ data: { token: 'signed-token', companyId }, error: null });

    await vi.waitFor(() => {
      expect(usertour.start).toHaveBeenCalledWith('flow-product', { continue: false });
    });
  });

  it('leaves a retryable failure after navigation when Usertour is unavailable', async () => {
    const { service, router } = setup();
    usertour.start.mockRejectedValueOnce(new Error('vendor unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(service.launch('creating-a-product')).resolves.toBe('started');

    expect(router.navigateByUrl).toHaveBeenCalledWith('/inventory/products');
    await vi.waitFor(() => {
      expect(service.launchFailure()).toEqual({
        key: 'creating-a-product',
        result: 'vendor-disabled',
      });
    });
    service.dismissLaunchFailure();
    expect(service.launchFailure()).toBeNull();
    warning.mockRestore();
  });

  it('fails closed on permissions before navigating or starting content', async () => {
    const { service, router } = setup(false);

    await expect(service.launch('creating-a-product')).resolves.toBe('permission-denied');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(usertour.start).not.toHaveBeenCalled();
  });

  it('does not leave the launch page when the walkthrough has no Usertour content', async () => {
    LEARNING_CONTENT_REGISTRY['creating-a-product'].usertourContentId = '';
    const { service, router } = setup();

    await expect(service.launch('creating-a-product')).resolves.toBe('content-unconfigured');

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(usertour.start).not.toHaveBeenCalled();
  });

  it('resets identity on logout and does not surface vendor event failures', async () => {
    const { service, identity } = setup();
    await service.initialize();
    usertour.track.mockRejectedValueOnce(new Error('vendor unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(service.track('dukarun_product_created')).resolves.toBeUndefined();
    identity.set(null);
    TestBed.flushEffects();

    expect(usertour.reset).toHaveBeenCalled();
    warning.mockRestore();
  });

  it('resets and re-identifies when the active company changes', async () => {
    const { service, identity } = setup();
    await service.initialize();
    const nextCompanyId = '123e4567-e89b-42d3-a456-426614174002';

    identity.set({ userId, companyId: nextCompanyId });
    TestBed.flushEffects();
    await vi.waitFor(() => {
      expect(usertour.group).toHaveBeenLastCalledWith(
        nextCompanyId,
        {},
        expect.objectContaining({ token: 'signed-token' })
      );
    });

    expect(usertour.reset).toHaveBeenCalled();
  });

  it('does not identify a stale request after logout', async () => {
    const { service, identity, invoke } = setup();
    const pending = deferred<{
      data: { token: string; companyId: string };
      error: null;
    }>();
    invoke.mockImplementationOnce(() => pending.promise);

    const initialization = service.initialize();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    identity.set(null);
    TestBed.flushEffects();
    pending.resolve({ data: { token: 'signed-token', companyId }, error: null });

    await expect(initialization).resolves.toBe(false);
    expect(usertour.identify).not.toHaveBeenCalled();
  });

  it('starts vendor identification before navigation completes', async () => {
    const { service, router, invoke } = setup();
    const navigation = deferred<boolean>();
    router.navigateByUrl.mockReturnValueOnce(navigation.promise);

    const launch = service.launch('creating-a-product');
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('usertour-identity', expect.anything())
    );

    navigation.resolve(true);
    await expect(launch).resolves.toBe('started');
    await vi.waitFor(() => {
      expect(usertour.start).toHaveBeenCalledWith('flow-product', { continue: false });
    });
  });

  it('stays quiet when learning timing is disabled', async () => {
    localStorage.setItem('dukarun:learning-timing', '0');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const { service } = setup();

      await expect(service.launch('creating-a-product')).resolves.toBe('started');
      await vi.waitFor(() => expect(usertour.start).toHaveBeenCalled());

      expect(info).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem('dukarun:learning-timing');
      info.mockRestore();
    }
  });

  it('logs phase timings by default', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const { service } = setup();

      await expect(service.launch('creating-a-product')).resolves.toBe('started');
      await vi.waitFor(() => expect(usertour.start).toHaveBeenCalled());

      const logged = info.mock.calls.map(call => String(call[0])).join('\n');
      expect(logged).toContain('[learning] launch creating-a-product navigate');
      expect(logged).toContain('[learning] signed-identity');
      expect(logged).toContain('[learning] sdk-identify');
      expect(logged).toContain('[learning] launch creating-a-product start');
    } finally {
      info.mockRestore();
    }
  });
});
