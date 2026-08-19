import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CashierSessionDialogService } from '../../core/cashier-session-dialog.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { CompanyPreferencesService } from '../../core/company-preferences.service';
import { PermissionsService } from '../../core/permissions.service';
import { PrintService } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyService, type CashierSession } from '../money.service';
import { CashierSessionModalComponent } from './cashier-session-modal.component';

describe('CashierSessionModalComponent guidance', () => {
  async function render(options: {
    canViewFinancials?: boolean;
    closing?: boolean;
    guidanceError?: boolean;
    guidancePromise?: Promise<Array<{ account_code: string; expected_balance: number }>>;
  }) {
    const session = options.closing
      ? ({
          id: 'session-id',
          company_id: 'company-id',
          location_id: 'location-id',
          status: 'open',
          opened_at: new Date().toISOString(),
        } as CashierSession)
      : null;
    const money = {
      cashierAccounts: vi.fn().mockResolvedValue([{ account_code: 'CASH_ON_HAND', label: 'Cash' }]),
      openSession: vi.fn().mockResolvedValue(session),
      recentSessions: vi.fn().mockResolvedValue([]),
      sessionReconAccounts: vi.fn().mockResolvedValue([]),
      cashierExpectedBalances: options.guidancePromise
        ? vi.fn().mockReturnValue(options.guidancePromise)
        : options.guidanceError
          ? vi.fn().mockRejectedValue(new Error('offline'))
          : vi.fn().mockResolvedValue([{ account_code: 'CASH_ON_HAND', expected_balance: 1_000 }]),
      openCashierSession: vi.fn().mockResolvedValue('session-id'),
      closeCashierSession: vi.fn().mockResolvedValue('session-id'),
    };
    const dialog = {
      visible: signal(true),
      completed: signal(0),
      hide: vi.fn(),
      markCompleted: vi.fn(),
    };
    const sessionState = {
      session: signal(session),
      refresh: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [CashierSessionModalComponent],
      providers: [
        { provide: MoneyService, useValue: money },
        { provide: CashierSessionDialogService, useValue: dialog },
        { provide: CashierSessionService, useValue: sessionState },
        {
          provide: CompanyPreferencesService,
          useValue: {
            requireOpeningCount: signal(true),
            varianceNotificationThreshold: signal(100),
          },
        },
        {
          provide: PermissionsService,
          useValue: {
            has: (permission: string) =>
              permission === 'ViewFinancials' && Boolean(options.canViewFinancials),
          },
        },
        {
          provide: ReceiptDataService,
          useValue: {
            printerEnabled: vi.fn().mockResolvedValue(false),
            buildCashierSlipData: vi.fn(),
            companyPrintInfo: vi.fn(),
          },
        },
        { provide: PrintService, useValue: { printOrder: vi.fn() } },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(CashierSessionModalComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(money.cashierAccounts).toHaveBeenCalledOnce());
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '1050';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const review = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Review')
    ) as HTMLButtonElement;
    review.click();
    await vi.waitFor(() => expect(money.cashierExpectedBalances).toHaveBeenCalledOnce());
    fixture.detectChanges();

    return { fixture, money, dialog };
  }

  it('shows non-numeric guidance to a cashier during closing review', async () => {
    const { fixture } = await render({ closing: true });

    expect(fixture.nativeElement.textContent).toContain('Review closing count');
    expect(fixture.nativeElement.textContent).toContain('Count looks close');
    expect(fixture.nativeElement.textContent).toContain('balance at review time');
    expect(fixture.nativeElement.textContent).not.toContain('Show expected amounts');
    expect(fixture.nativeElement.textContent).not.toContain('Expected 1,000');
  });

  it('lets ViewFinancials users reveal expected opening amounts', async () => {
    const { fixture } = await render({ canViewFinancials: true });
    const reveal = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Show expected amounts')
    ) as HTMLButtonElement;

    expect(reveal).toBeDefined();
    reveal.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Expected');
    expect(fixture.nativeElement.textContent).toContain('1,000');
    expect(fixture.nativeElement.textContent).toContain('50');
  });

  it('keeps confirmation available when guidance cannot load', async () => {
    const { fixture, money } = await render({ guidanceError: true });

    expect(fixture.nativeElement.textContent).toContain('Balance guidance is unavailable');
    const confirm = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Confirm open')
    ) as HTMLButtonElement;
    confirm.click();

    await vi.waitFor(() =>
      expect(money.openCashierSession).toHaveBeenCalledWith([
        { account_code: 'CASH_ON_HAND', declared: 1_050 },
      ])
    );
  });

  it('ignores an old guidance response after the dialog closes and reopens', async () => {
    let resolveGuidance!: (
      value: Array<{ account_code: string; expected_balance: number }>
    ) => void;
    const guidancePromise = new Promise<Array<{ account_code: string; expected_balance: number }>>(
      resolve => {
        resolveGuidance = resolve;
      }
    );
    const { fixture, dialog } = await render({ guidancePromise });

    dialog.visible.set(false);
    fixture.detectChanges();
    dialog.visible.set(true);
    fixture.detectChanges();
    resolveGuidance([{ account_code: 'CASH_ON_HAND', expected_balance: 1_000 }]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('dialog')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Count looks close');
  });
});
