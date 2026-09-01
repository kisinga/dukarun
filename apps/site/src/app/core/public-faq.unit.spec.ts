import { describe, expect, it } from 'vitest';
import { PUBLIC_FAQS } from './public-faq';

describe('public FAQs', () => {
  it('keeps each public buying question unique and answered', () => {
    const questions = PUBLIC_FAQS.map(faq => faq.question);

    expect(new Set(questions).size).toBe(questions.length);
    expect(PUBLIC_FAQS.every(faq => faq.question.length > 0 && faq.answer.length > 0)).toBe(true);
  });

  it('describes both onboarding routes and the current M-Pesa flow', () => {
    const copy = PUBLIC_FAQS.map(faq => `${faq.question} ${faq.answer}`).join(' ');

    expect(copy).toContain('30-minute orientation');
    expect(copy).toContain('typical engagements exceed KES 40,000');
    expect(copy).toContain('send an STK prompt');
    expect(copy).not.toContain('STK push from the buyer) is still in the works');
  });
});
