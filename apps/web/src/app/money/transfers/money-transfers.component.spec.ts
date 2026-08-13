import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from '../../core/cashier-session.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyTransfersComponent } from './money-transfers.component';
import { LedgerAccount, MoneyService } from '../money.service';

const accounts = [
  { code: 'CASH_ON_HAND', name: 'Cash on hand' },
  { code: 'MPESA_CONTROL', name: 'M-Pesa' },
] as unknown as LedgerAccount[];

describe('MoneyTransfersComponent account loading', () => {
  async function render(
    options: {
      historyError?: Error;
      historyPromise?: Promise<{ rows: never[]; count: number }>;
    } = {}
  ) {
    const money = {
      transactableAccounts: vi.fn().mockResolvedValue(accounts),
      journalPage: vi
        .fn()
        .mockImplementation(() =>
          options.historyPromise
            ? options.historyPromise
            : options.historyError
              ? Promise.reject(options.historyError)
              : Promise.resolve({ rows: [], count: 0 })
        ),
    };
    await TestBed.configureTestingModule({
      imports: [MoneyTransfersComponent],
      providers: [
        { provide: MoneyService, useValue: money },
        {
          provide: CashierSessionService,
          useValue: { canTakePayment: () => true, assertOpen: vi.fn() },
        },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(MoneyTransfersComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(money.transactableAccounts).toHaveBeenCalledOnce());
    const open = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes('New transfer')
    ) as HTMLButtonElement | undefined;
    expect(open).toBeDefined();
    open?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelectorAll('#transfer-form select').item(0).options
      ).toHaveLength(accounts.length);
    });
    return fixture;
  }

  it('keeps both transfer dropdowns usable when history fails', async () => {
    const fixture = await render({ historyError: new Error('Transfer history failed') });
    const [from, to] = fixture.nativeElement.querySelectorAll(
      '#transfer-form select'
    ) as NodeListOf<HTMLSelectElement>;
    const submit = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Post transfer')
    ) as HTMLButtonElement;

    expect(from.options).toHaveLength(2);
    expect(to.options).toHaveLength(2);
    expect(from.value).toBe('CASH_ON_HAND');
    expect(to.value).toBe('MPESA_CONTROL');
    expect(submit.disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Transfer history failed');
  });

  it('renders both account choices before a slow history request settles', async () => {
    let resolveHistory!: (value: { rows: never[]; count: number }) => void;
    const historyPromise = new Promise<{ rows: never[]; count: number }>(resolve => {
      resolveHistory = resolve;
    });

    const fixture = await render({ historyPromise });
    const selects = fixture.nativeElement.querySelectorAll(
      '#transfer-form select'
    ) as NodeListOf<HTMLSelectElement>;

    expect(selects[0].options).toHaveLength(2);
    expect(selects[1].options).toHaveLength(2);
    resolveHistory({ rows: [], count: 0 });
    await fixture.whenStable();
  });
});
