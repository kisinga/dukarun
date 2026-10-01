import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PlatformService } from '../../core/platform.service';
import { CommunicationsComponent } from './communications.component';

describe('CommunicationsComponent review', () => {
  it('displays server-rendered identity and segment count, and invalidates review after edits', async () => {
    const platform = {
      platformCampaigns: vi.fn().mockResolvedValue([]),
      tiers: vi.fn().mockResolvedValue([]),
      platformTemplates: vi.fn().mockResolvedValue([]),
      failedOutbox: vi.fn().mockResolvedValue([]),
      companies: vi.fn().mockResolvedValue([]),
      communicationSettings: vi.fn().mockResolvedValue(null),
      externalCommunicationMetrics: vi.fn().mockResolvedValue(null),
      saveCampaignDraft: vi.fn().mockResolvedValue('campaign'),
      reviewCampaign: vi.fn().mockResolvedValue({
        eligible: 1,
        skipped: 0,
        sample: { merchant_name: 'Amina Store' },
        rendered_title: 'Server title',
        rendered_body: 'Dukarun - Amina Store: Final server message.',
        sms_segments: 3,
      }),
    };
    await TestBed.configureTestingModule({
      imports: [CommunicationsComponent],
      providers: [{ provide: PlatformService, useValue: platform }],
    }).compileComponents();
    const fixture = TestBed.createComponent(CommunicationsComponent);
    const component = fixture.componentInstance;
    component['name'].setValue('Account notice');
    component['title'].setValue('Draft title');
    component['body'].setValue('Draft body');
    component['channel'].setValue('sms');
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog = fixture.nativeElement.querySelector('dialog');
    dialog.showModal = vi.fn();
    await component['review']();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Dukarun - Amina Store: Final server message.'
    );
    expect(fixture.nativeElement.textContent).toContain(
      '3 SMS segment(s), including account identity'
    );
    expect(component['renderedTitle']()).toBe('Server title');
    component['body'].setValue('Changed content');
    expect(component['preview']()).toBeNull();
  });
});
