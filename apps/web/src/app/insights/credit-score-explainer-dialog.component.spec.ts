import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { IconComponent } from '../shared/ui/icon.component';
import { CreditScoreExplainerDialogComponent } from './credit-score-explainer-dialog.component';
import type { PartyCreditProfile } from './insights.models';

function profile(overrides: Partial<PartyCreditProfile> = {}): PartyCreditProfile {
  return {
    party_id: 'supplier-1',
    side: 'supplier',
    party_name: 'Green Hills',
    score: 6.9,
    band: 'watch',
    confidence: 'provisional',
    balance: 109_081,
    credit_limit: 200_000,
    available_credit: 90_919,
    utilization: 0.545405,
    overdue_amount: 18_488,
    oldest_due_on: '2026-09-15',
    oldest_overdue_days: 11,
    settled_documents: 0,
    history_days: 200,
    punctuality: 1,
    recommendation_code: 'pause_increases_target_down_10',
    reason_codes: ['overdue_8_30'],
    opportunity_cost: 0,
    refreshed_at: '2026-09-26T18:44:16Z',
    ...overrides,
  };
}

describe('CreditScoreExplainerDialogComponent', () => {
  async function render(value = profile()) {
    await TestBed.configureTestingModule({ imports: [CreditScoreExplainerDialogComponent] })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(CreditScoreExplainerDialogComponent);
    fixture.componentRef.setInput('profile', value);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the exact base weights and current-profile evidence', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent.replace(/\s+/g, ' ');

    expect(text).toContain('Payment timeliness45%');
    expect(text).toContain('Overdue exposure30%');
    expect(text).toContain('Limit utilization15%');
    expect(text).toContain('Recent direction10%');
    expect(text).toContain('This profile: 100% timeliness signal');
    expect(text).toContain('KES 18,488 of KES 109,081 overdue');
    expect(text).toContain('55% of the limit used');
    expect(text).toContain('not included — 0 of 2 settled documents');
  });

  it('explains normalization, caps, bands, and corrective evidence', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent.replace(/\s+/g, ' ');

    expect(text).toContain('remaining weights are rebalanced');
    expect(text).toContain('No settled-document history');
    expect(text).toContain('Applies now');
    expect(text).toContain('0–2.9High risk');
    expect(text).toContain('8.5–10Strong');
    expect(text).toContain(
      'Corrective adjustments can change exposure but do not count as repayment performance.'
    );
  });

  it('marks unavailable factors without hiding their base weights', async () => {
    const fixture = await render(
      profile({
        balance: 0,
        overdue_amount: 0,
        credit_limit: 0,
        utilization: null,
        punctuality: null,
      })
    );
    const text = fixture.nativeElement.textContent.replace(/\s+/g, ' ');
    const inactiveSegments = fixture.nativeElement.querySelectorAll('[role="img"] > .opacity-25');

    expect(text).toContain('not included — no payment evidence');
    expect(text).toContain('not included — no live balance');
    expect(text).toContain('not included — no credit limit');
    expect(inactiveSegments.length).toBe(4);
  });

  it('identifies the strongest currently applicable cap', async () => {
    const fixture = await render(
      profile({
        balance: 1_000,
        credit_limit: 1_000,
        overdue_amount: 300,
        oldest_overdue_days: 61,
        settled_documents: 3,
      })
    );
    const capRows = [...fixture.nativeElement.querySelectorAll('li')].map(element =>
      element.textContent.replace(/\s+/g, ' ')
    );

    expect(capRows.find(row => row.includes('2.9'))).toContain('Applies now');
    expect(capRows.find(row => row.includes('4.9'))).not.toContain('Applies now');
    expect(capRows.find(row => row.includes('6.9'))).not.toContain('Applies now');
  });
});
