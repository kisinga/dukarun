import { renderOutbound } from '../../../src/services/notifications/outbound.render';

describe('Outbound renderers', () => {
  describe('credit reminders', () => {
    it('renders the 3-day customer reminder', () => {
      const rendered = renderOutbound('credit_period_3_days', {
        customerName: 'Test Customer',
        outstandingAmount: 125000,
        orderCode: 'ORD123',
        dueDate: '2026-07-12T00:00:00.000Z',
      });

      expect(rendered.whatsappBody).toContain('Friendly payment reminder');
      expect(rendered.whatsappBody).toContain('Test Customer');
      expect(rendered.whatsappBody).toContain('ORD123');
      expect(rendered.emailSubject).toBe('Friendly payment reminder');
    });

    it('renders the 10-day freeze reminder', () => {
      const rendered = renderOutbound('credit_period_10_days_frozen', {
        customerName: 'Test Customer',
        outstandingAmount: 125000,
      });

      expect(rendered.whatsappBody).toContain('Credit account frozen');
      expect(rendered.whatsappBody).toContain('no further credit sales are allowed');
    });

    it('renders the limit reached reminder', () => {
      const rendered = renderOutbound('credit_limit_reached', {
        customerName: 'Test Customer',
        outstandingAmount: 90000,
        creditLimit: 100000,
        utilizationPercent: 90,
      });

      expect(rendered.whatsappBody).toContain('Credit limit alert');
      expect(rendered.whatsappBody).toContain('90%');
      expect(rendered.emailBody).toContain('KES 900.00');
      expect(rendered.emailBody).toContain('KES 1,000.00');
    });

    it('renders admin copies', () => {
      const rendered = renderOutbound('credit_period_7_days_admin', {
        customerName: 'Test Customer',
        outstandingAmount: 125000,
      });

      expect(rendered.inAppTitle).toBe('Credit Reminder');
      expect(rendered.inAppMessage).toContain('Test Customer');
      expect(rendered.inAppMessage).toContain('7 days overdue');
    });

    it('renders credit sale blocked admin alert', () => {
      const rendered = renderOutbound('credit_sale_blocked', {
        customerName: 'Test Customer',
        reason: 'limit_exceeded',
      });

      expect(rendered.inAppTitle).toBe('Credit Sale Blocked');
      expect(rendered.inAppMessage).toContain('Test Customer');
      expect(rendered.inAppMessage).toContain('limit exceeded');
    });
  });
});
