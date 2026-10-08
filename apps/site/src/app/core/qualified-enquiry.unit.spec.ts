import { describe, expect, it } from 'vitest';
import {
  acquisitionSource,
  classifyAcquisitionLink,
  enquiryIntent,
  enquiryPath,
} from '../../../../../packages/public-acquisition';
import { dukarunWhatsAppUrl } from './public-contact';
import { EMPTY_ENQUIRY, enquiryErrors, qualifiedEnquiryMessage } from './qualified-enquiry';

const answers = {
  businessType: 'Electricals & lighting',
  locations: '1',
  staff: '1–3',
  need: 'Stock',
  records: 'Notebook',
  timing: 'Within 30 days',
  assistance: 'Staff training',
};
describe('qualified acquisition', () => {
  it('validates all answers without rejecting larger businesses', () => {
    expect(Object.keys(enquiryErrors(EMPTY_ENQUIRY))).toHaveLength(7);
    expect(enquiryErrors({ ...answers, locations: '4+', staff: '11+' })).toEqual({});
    expect(enquiryErrors({ ...answers, businessType: 'x'.repeat(81) }).businessType).toBeTruthy();
    expect(enquiryErrors({ ...answers, records: 'unsupported' }).records).toBeTruthy();
  });
  it('sanitizes untrusted source parameters and never makes an external destination', () => {
    const source = acquisitionSource(
      new URLSearchParams(
        'from=https://evil.test&blog_ref=bad&utm_source=a%0Ab&intent=https://evil.test'
      )
    );
    expect(source).toEqual({ from: '/contact', utmSource: 'ab' });
    expect(enquiryIntent('invalid')).toBe('demo');
    expect(enquiryPath('setup', source)).toBe(
      '/contact?intent=setup&from=%2Fcontact&utm_source=ab'
    );
  });
  it('classifies supported destinations regardless of CTA wording', () => {
    const classify = (href: string) =>
      classifyAcquisitionLink(href, 'https://dukarun.com', 'https://app.dukarun.com');
    expect(classify('/contact?intent=setup')).toBe('setup');
    expect(classify('/contact')).toBe('demo');
    expect(classify('https://app.dukarun.com/register?blog_ref=old')).toBe('registration');
    expect(classify('/tools/daily-shop-cash-up')).toBe('cash-up');
    for (const href of [
      'javascript:alert(1)',
      'https://evil.test/contact',
      '//evil.test/register',
      '/docs',
    ])
      expect(classify(href)).toBeNull();
  });
  it('encodes a readable message while keeping answers out of acquisition URLs', () => {
    const source = {
      from: '/blog/stock',
      utmSource: 'WhatsApp group',
      utmCampaign: 'owner & staff',
    };
    const message = qualifiedEnquiryMessage('setup', answers, source);
    expect(message).toContain('setup and staff training quote');
    expect(message).toContain('Business type: Electricals & lighting');
    expect(message).toContain('Campaign: owner & staff');
    expect(new URL(dukarunWhatsAppUrl(message)).searchParams.get('text')).toBe(message);
    const url = enquiryPath('demo', source);
    expect(url).not.toContain('Electricals');
    expect(url).not.toContain('Notebook');
  });
});
