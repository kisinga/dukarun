import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from '../../core/cashier-session.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyExpensesComponent } from './money-expenses.component';
import { LedgerAccount, MoneyService } from '../money.service';

const accounts = [
  { code: 'CASH_ON_HAND', name: 'Cash on hand' },
  { code: 'MPESA_CONTROL', name: 'M-Pesa' },
] as unknown as LedgerAccount[];

describe('MoneyExpensesComponent account loading', () => {
  async function render(options: {
    accounts?: LedgerAccount[];
    accountError?: Error;
    historyError?: Error;
    historyPromise?: Promise<{ rows: never[]; count: number }>;
  }) {
    const money = {
      transactableAccounts: vi
        .fn()
        .mockImplementation(() =>
          options.accountError
            ? Promise.reject(options.accountError)
            : Promise.resolve(options.accounts ?? accounts)
        ),
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
      imports: [MoneyExpensesComponent],
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
    const fixture = TestBed.createComponent(MoneyExpensesComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(money.transactableAccounts).toHaveBeenCalledOnce());
    const open = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Record expense')
    ) as HTMLButtonElement | undefined;
    expect(open).toBeDefined();
    open?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      if (options.accountError) {
        expect(
          fixture.nativeElement.querySelector('#expense-form select option').textContent
        ).toContain('Accounts unavailable');
      } else {
        expect(fixture.nativeElement.querySelectorAll('#expense-form select option')).toHaveLength(
          accounts.length
        );
      }
    });
    return { fixture, money };
  }

  it('keeps valid account options when expense history fails', async () => {
    const { fixture } = await render({ historyError: new Error('History query failed') });
    const select = fixture.nativeElement.querySelector('#expense-form select') as HTMLSelectElement;
    const submit = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Post expense')
    ) as HTMLButtonElement;

    expect([...select.options].map(option => option.textContent?.trim())).toEqual([
      'CASH_ON_HAND — Cash on hand',
      'MPESA_CONTROL — M-Pesa',
    ]);
    expect(select.value).toBe('CASH_ON_HAND');
    expect(submit.disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('History query failed');
  });

  it('distinguishes an account request failure from an empty configuration', async () => {
    const { fixture } = await render({ accountError: new Error('Accounts request failed') });
    const select = fixture.nativeElement.querySelector('#expense-form select') as HTMLSelectElement;
    const submit = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Post expense')
    ) as HTMLButtonElement;

    expect(select.options[0].textContent).toContain('Accounts unavailable');
    expect(fixture.nativeElement.textContent).toContain('Accounts request failed');
    expect(submit.disabled).toBe(true);
  });

  it('renders account choices before a slow history request settles', async () => {
    let resolveHistory!: (value: { rows: never[]; count: number }) => void;
    const historyPromise = new Promise<{ rows: never[]; count: number }>(resolve => {
      resolveHistory = resolve;
    });

    const { fixture } = await render({ historyPromise });
    const select = fixture.nativeElement.querySelector('#expense-form select') as HTMLSelectElement;

    expect(select.options).toHaveLength(2);
    resolveHistory({ rows: [], count: 0 });
    await fixture.whenStable();
  });
});
