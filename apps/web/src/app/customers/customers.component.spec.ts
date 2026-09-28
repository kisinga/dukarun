import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalsService } from '../approvals/approvals.service';
import { BusinessClockService } from '../core/business-clock.service';
import { CashierSessionService } from '../core/cashier-session.service';
import { LocationContextService } from '../core/location-context.service';
import { MpesaCheckoutCoordinator } from '../core/mpesa-checkout-coordinator.service';
import { MpesaService } from '../core/mpesa.service';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { InsightsService } from '../insights/insights.service';
import { LearningPlatformService } from '../learning/learning-platform.service';
import { MoneyService } from '../money/money.service';
import { PosService } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { CustomersComponent } from './customers.component';

async function setup(permission: string) {
  const creditOrders = vi.fn().mockResolvedValue([{ outstanding: 50 }]);
  await TestBed.configureTestingModule({
    imports: [CustomersComponent],
    providers: [
      provideRouter([]),
      {
        provide: PermissionsService,
        useValue: { has: (requested: string) => requested === permission },
      },
      {
        provide: MoneyService,
        useValue: { creditOrders, enabledMethodCodes: async () => ['cash'] },
      },
      {
        provide: PartyCacheService,
        useValue: {
          loaded: signal(true),
          complete: signal(true),
          customerRows: () => [],
          ensureLoaded: async () => true,
        },
      },
      { provide: MpesaService, useValue: { refreshAvailability: async () => undefined } },
      { provide: ApprovalsService, useValue: {} },
      { provide: BusinessClockService, useValue: {} },
      { provide: CashierSessionService, useValue: {} },
      { provide: LocationContextService, useValue: {} },
      { provide: MpesaCheckoutCoordinator, useValue: {} },
      { provide: InsightsService, useValue: {} },
      { provide: LearningPlatformService, useValue: {} },
      { provide: PosService, useValue: {} },
      { provide: PrintService, useValue: {} },
      { provide: ReceiptDataService, useValue: {} },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(CustomersComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Customers');
  expect(fixture.componentInstance['error']()).toBeNull();
  return { component: fixture.componentInstance, creditOrders };
}

describe('Customer account read permissions', () => {
  it('does not call the account RPC for a credit-limit-only user', async () => {
    const { component, creditOrders } = await setup('ManageCustomerCreditLimit');
    expect(component['canReadCustomerAccount']()).toBe(false);
    await expect(component['loadCreditOrders']('customer-1')).resolves.toEqual([]);
    expect(creditOrders).not.toHaveBeenCalled();
  });

  it.each(['ViewFinancials', 'SettleOrder', 'ManageCustomers'])(
    'loads the canonical account for %s',
    async permission => {
      const { component, creditOrders } = await setup(permission);
      expect(component['canReadCustomerAccount']()).toBe(true);
      await expect(component['loadCreditOrders']('customer-1')).resolves.toEqual([
        { outstanding: 50 },
      ]);
      expect(creditOrders).toHaveBeenCalledWith('customer-1');
    }
  );
});
