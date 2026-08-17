import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '../../core/permissions.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyService, type ReconcilableAccount } from '../money.service';
import { MoneyReconciliationComponent } from './money-reconciliation.component';

const accounts: ReconcilableAccount[] = [
  {
    account_code: 'BANK_MAIN',
    account_name: 'Bank - Main',
    balance: 12_000,
    requires_reconciliation: true,
    last_reconciled_at: null,
  },
  {
    account_code: 'CASH_ON_HAND',
    account_name: 'Cash on Hand',
    balance: 4_000,
    requires_reconciliation: true,
    last_reconciled_at: null,
  },
];

describe('MoneyReconciliationComponent', () => {
  async function render(canManage = true) {
    const money = {
      reconcilableAccounts: vi.fn().mockResolvedValue(accounts),
      recentReconciliations: vi.fn().mockResolvedValue([]),
      recordManualReconciliation: vi.fn().mockResolvedValue('reconciliation-id'),
      revertVariance: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [MoneyReconciliationComponent],
      providers: [
        provideRouter([]),
        { provide: MoneyService, useValue: money },
        {
          provide: PermissionsService,
          useValue: {
            has: (permission: string) => permission !== 'ManageReconciliation' || canManage,
          },
        },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(MoneyReconciliationComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(money.reconcilableAccounts).toHaveBeenCalledOnce());
    fixture.detectChanges();
    return { fixture, money };
  }

  it('shows non-cashier bank accounts and reconciles one account independently', async () => {
    const { fixture, money } = await render();
    expect(fixture.nativeElement.textContent).toContain('Bank - Main');

    const setBalanceButtons = [...fixture.nativeElement.querySelectorAll('button')].filter(button =>
      button.textContent?.includes('Set actual balance')
    ) as HTMLButtonElement[];
    setBalanceButtons[0].click();
    fixture.detectChanges();

    const inputs = fixture.nativeElement.querySelectorAll(
      'dialog input'
    ) as NodeListOf<HTMLInputElement>;
    inputs[0].value = '12500';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = 'Bank statement correction';
    inputs[1].dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const review = [...fixture.nativeElement.querySelectorAll('dialog button')].find(button =>
      button.textContent?.includes('Review change')
    ) as HTMLButtonElement;
    review.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog').textContent).toContain('Adjustment');

    const confirm = [...fixture.nativeElement.querySelectorAll('dialog button')].find(button =>
      button.textContent?.includes('Confirm balance')
    ) as HTMLButtonElement;
    confirm.click();

    await vi.waitFor(() =>
      expect(money.recordManualReconciliation).toHaveBeenCalledWith([
        {
          account_code: 'BANK_MAIN',
          declared: 12_500,
          reason: 'Bank statement correction',
        },
      ])
    );
  });

  it('requires a reason for a changed balance', async () => {
    const { fixture, money } = await render();
    const setBalance = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Set actual balance')
    ) as HTMLButtonElement;
    setBalance.click();
    fixture.detectChanges();

    const actual = fixture.nativeElement.querySelector('dialog input') as HTMLInputElement;
    actual.value = '12500';
    actual.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const review = [...fixture.nativeElement.querySelectorAll('dialog button')].find(button =>
      button.textContent?.includes('Review change')
    ) as HTMLButtonElement;
    review.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Enter a reason for changing the book balance'
    );
    expect(money.recordManualReconciliation).not.toHaveBeenCalled();
  });

  it('keeps adjustment actions hidden without reconciliation permission', async () => {
    const { fixture } = await render(false);
    expect(fixture.nativeElement.textContent).toContain('View only');
    expect(fixture.nativeElement.textContent).not.toContain('Set actual balance');
  });
});
