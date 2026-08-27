import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../environments/environment';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService } from '../core/supabase.service';
import { LEARNING_CONTENT_REGISTRY } from './learning-content';
import { LearningPlatformService } from './learning-platform.service';

const usertour = vi.hoisted(() => ({
  init: vi.fn(),
  disableEvalJs: vi.fn(),
  setBaseZIndex: vi.fn(),
  setUrlFilter: vi.fn(),
  setCustomNavigate: vi.fn(),
  identify: vi.fn().mockResolvedValue(undefined),
  group: vi.fn().mockResolvedValue(undefined),
  start: vi.fn().mockResolvedValue(undefined),
  track: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
}));

vi.mock('usertour.js', () => ({ default: usertour }));

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
    expect(usertour.setUrlFilter).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('usertour-identity');
    expect(usertour.identify).toHaveBeenCalledWith(userId, {}, { token: 'signed-token' });
    expect(usertour.group).toHaveBeenCalledWith(
      companyId,
      {},
      expect.objectContaining({ token: 'signed-token' })
    );
  });

  it('uses explicit destinations and resumes journeys', async () => {
    const { service, router } = setup();

    await expect(service.launch('creating-a-product')).resolves.toBe('started');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/inventory/products');
    expect(usertour.start).toHaveBeenCalledWith('flow-product', { continue: false });

    await expect(service.launch('first-business-cycle')).resolves.toBe('started');
    expect(router.navigateByUrl).toHaveBeenLastCalledWith('/dashboard');
    expect(usertour.start).toHaveBeenLastCalledWith('checklist-cycle', { continue: true });
  });

  it('fails closed on permissions before navigating or starting content', async () => {
    const { service, router } = setup(false);

    await expect(service.launch('creating-a-product')).resolves.toBe('permission-denied');
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
});
