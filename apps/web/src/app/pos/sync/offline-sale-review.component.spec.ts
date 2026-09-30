import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '../../core/permissions.service';
import { ServerClockService } from '../../core/server-clock.service';
import { OfflinePostingService } from '../offline/offline-posting.service';
import type { OfflineReview, OfflineSession } from '../offline/offline-contract';
import { OfflineSaleReviewComponent } from './offline-sale-review.component';

const session = {
  id: 'session-original',
  status: 'open',
  opened_at: '2026-09-29T08:00:00Z',
} as OfflineSession;
const review = (): OfflineReview => ({
  request_id: 'held-sale',
  status: 'review',
  captured_at: '2026-09-28T08:00:00Z',
  server_time: '2026-09-29T10:00:00Z',
  original_session: session,
  destination_session: session,
  original_closing_count: null,
  open_sessions: [session],
  lines: [],
  total: 116,
  paid: 116,
  payments: [{ method: 'cash', amount: 116 }],
  blockers: [{ code: 'capture_age_review' }],
  review_fingerprint: 'review-1',
  vat: { active_profile: { vat_registered: true } },
  original_request: {
    protocol_version: 2,
    customer_id: null,
    offline_context_id: 'context',
    originating_session_id: session.id,
    occurred_at: '2026-09-28T08:00:00Z',
    device_key: 'device',
    location_id: 'location',
    client_ref: 'sale',
    lines: [],
    payments: [{ method: 'cash', amount: 116 }],
  } as OfflineReview['original_request'],
  proposed_request: {
    protocol_version: 2,
    customer_id: null,
    offline_context_id: 'context',
    originating_session_id: session.id,
    occurred_at: '2026-09-28T08:00:00Z',
    device_key: 'device',
    location_id: 'location',
    client_ref: 'sale',
    lines: [],
    payments: [{ method: 'cash', amount: 116 }],
  } as OfflineReview['proposed_request'],
});
type ReviewControls = {
  review: WritableSignal<OfflineReview | null>;
  error: WritableSignal<string>;
  reason: string;
  confirm(): Promise<void>;
  selectDestination(id: string): void;
};

describe('Offline sale review', () => {
  const posting = { review: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), submit: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks();
    posting.review.mockResolvedValue(review());
    TestBed.configureTestingModule({
      imports: [OfflineSaleReviewComponent],
      providers: [
        provideRouter([]),
        { provide: OfflinePostingService, useValue: posting },
        { provide: PermissionsService, useValue: { has: () => true } },
        {
          provide: ServerClockService,
          useValue: { now: () => Date.parse('2026-09-29T10:00:00Z') },
        },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  async function render() {
    const fixture = TestBed.createComponent(OfflineSaleReviewComponent);
    fixture.componentRef.setInput('reviewId', 'held-sale');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, controls: fixture.componentInstance as unknown as ReviewControls };
  }

  it('loads once and shows capture age, VAT, payments, and blockers together', async () => {
    const { fixture } = await render();
    expect(posting.review).toHaveBeenCalledOnce();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('26 hours old');
    expect(text).toContain('Current VAT rules apply');
    expect(text).toContain('Payments retained');
    expect(text).toContain('Captured 24 hours ago or more');
  });

  it('retains the confirmation key after an unknown response and only resolves on completion', async () => {
    const { fixture, controls } = await render();
    const resolved = vi.fn();
    fixture.componentInstance.resolved.subscribe(resolved);
    controls.reason = 'Reviewed captured payment';
    posting.confirm
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce({ status: 'completed' });
    await controls.confirm();
    expect(resolved).not.toHaveBeenCalled();
    expect(controls.error()).toBe('Connection lost');
    await controls.confirm();
    expect(posting.confirm.mock.calls[1][1]).toBe(posting.confirm.mock.calls[0][1]);
    expect(resolved).toHaveBeenCalledOnce();
  });

  it('ignores a stale destination response and requires the latest reviewed session', async () => {
    const { fixture, controls } = await render();
    let oldResponse!: (value: OfflineReview) => void;
    posting.review.mockReturnValueOnce(
      new Promise(resolve => {
        oldResponse = resolve;
      })
    );
    const latest = {
      ...review(),
      review_fingerprint: 'latest',
      destination_session: { ...session, id: 'new-session' },
    };
    posting.review.mockResolvedValueOnce(latest);
    controls.selectDestination('older-session');
    controls.selectDestination('new-session');
    await fixture.whenStable();
    oldResponse({ ...review(), review_fingerprint: 'outdated' });
    await fixture.whenStable();
    expect(controls.review()?.review_fingerprint).toBe('latest');
    expect(controls.review()?.destination_session?.id).toBe('new-session');
  });

  it('resumes an approved server-held sale without a local queue or another revision', async () => {
    const approved = { ...review(), status: 'approval' as const, blockers: [] };
    approved.proposed_request = { ...approved.original_request, customer_id: 'corrected-customer' };
    posting.review.mockResolvedValue(approved);
    posting.submit.mockResolvedValue({ status: 'completed' });
    const { fixture } = await render();
    const resolved = vi.fn();
    fixture.componentInstance.resolved.subscribe(resolved);
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (element: HTMLButtonElement) => element.textContent?.includes('Check approval and post')
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    await fixture.whenStable();
    expect(posting.submit).toHaveBeenCalledWith(approved.original_request);
    expect(posting.confirm).not.toHaveBeenCalled();
    expect(resolved).toHaveBeenCalledOnce();
  });

  it('keeps an ambiguous resume retry on the immutable original request', async () => {
    const approved = { ...review(), status: 'approval' as const, blockers: [] };
    posting.review.mockResolvedValue(approved);
    posting.submit
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce({ status: 'approval', blockers: [{ code: 'approval_required' }] });
    const { fixture, controls } = await render();
    const resolved = vi.fn();
    fixture.componentInstance.resolved.subscribe(resolved);
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (element: HTMLButtonElement) => element.textContent?.includes('Check approval and post')
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(controls.error()).toBe('Connection lost');
    button.click();
    await fixture.whenStable();
    expect(posting.submit.mock.calls).toEqual([
      [approved.original_request],
      [approved.original_request],
    ]);
    expect(posting.confirm).not.toHaveBeenCalled();
    expect(resolved).not.toHaveBeenCalled();
    expect(controls.error()).toBe('This sale is still waiting for approval.');
  });
});
