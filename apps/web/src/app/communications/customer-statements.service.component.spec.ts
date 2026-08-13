import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../core/supabase.service';
import { CustomerStatementsService } from './customer-statements.service';

describe('CustomerStatementsService', () => {
  it('queues only the selected customer, channel, and quiet-hours choice', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        queued: true,
        outbox_id: 'outbox-1',
        recipient: '+254700000001',
        body: 'Fixed statement message',
        expires_at: '2026-08-20T00:00:00Z',
      },
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        CustomerStatementsService,
        { provide: SupabaseService, useValue: { client: { rpc } } },
      ],
    });

    const service = TestBed.inject(CustomerStatementsService);
    await expect(service.send('customer-1', 'whatsapp', true)).resolves.toMatchObject({
      queued: true,
      recipient: '+254700000001',
    });
    expect(rpc).toHaveBeenCalledWith('send_customer_statement', {
      p_customer_id: 'customer-1',
      p_channel: 'whatsapp',
      p_bypass_quiet_hours: true,
    });
  });
});
