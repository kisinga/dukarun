/**
 * Component tests for Dashboard Layout
 */

import {
  computed,
  provideZonelessChangeDetection,
  signal,
  type WritableSignal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY, of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CompanyService } from '../../core/services/company.service';
import { AppInitService } from '../../core/services/app-init.service';
import { NotificationService } from '../../core/services/notification.service';
import { StockLocationService } from '../../core/services/stock-location.service';
import { NetworkService } from '../../core/services/network.service';
import { NotificationStateService } from '../../core/services/notification/notification-state.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ToastService } from '../../core/services/toast.service';
import { CashierSessionService } from '../../core/services/cashier-session/cashier-session.service';
import { ShiftModalTriggerService } from '../../core/services/cashier-session/shift-modal-trigger.service';
import { RegisterLinkPreviewsService } from '../../core/services/link-preview/register-link-previews.service';
import { DashboardLayoutComponent } from './dashboard-layout.component';

class MockNotificationService {
  private readonly notificationsSignal = signal([]);
  private readonly unreadCountSignal = signal(0);

  readonly notifications = this.notificationsSignal.asReadonly();
  readonly unreadCount = this.unreadCountSignal.asReadonly();

  promptPermissionIfNeeded(): void {
    return;
  }

  async loadUnreadCount(): Promise<void> {
    return;
  }

  async markAsRead(): Promise<boolean> {
    return true;
  }

  async markAllAsRead(): Promise<number> {
    this.unreadCountSignal.set(0);
    return 0;
  }
}

describe('DashboardLayoutComponent', () => {
  let component: DashboardLayoutComponent;
  let fixture: ComponentFixture<DashboardLayoutComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let subscriptionState: WritableSignal<SubscriptionHarnessState>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let cashierSessionSpy: jasmine.SpyObj<CashierSessionService>;

  beforeEach(async () => {
    const companySpy = jasmine.createSpyObj('CompanyService', ['activateCompany'], {
      companies: signal([]),
      activeCompanyId: signal('1'),
      activeCompany: signal({ id: '1', code: 'test', token: 'token' }),
      companyDisplayName: signal('Test Company'),
      companyLogoAsset: signal(null),
      companyLogoUrl: signal(null),
    });

    const authSpy = jasmine.createSpyObj(
      'AuthService',
      [
        'logout',
        'hasUpdateSettingsPermission',
        'hasCreditManagementPermission',
        'hasManageStockAdjustmentsPermission',
        'canSettleOrders',
        'hasManageApprovalsPermission',
        'hasSuperAdminPermission',
      ],
      {
        user: signal({ id: 'user-1', emailAddress: 'test@example.com' }),
        fullName: signal('Test User'),
      },
    );
    authSpy.hasUpdateSettingsPermission.and.returnValue(false);
    authSpy.hasCreditManagementPermission.and.returnValue(false);
    authSpy.hasManageStockAdjustmentsPermission.and.returnValue(false);
    authSpy.canSettleOrders.and.returnValue(false);
    authSpy.hasManageApprovalsPermission.and.returnValue(false);
    authSpy.hasSuperAdminPermission.and.returnValue(false);

    subscriptionState = signal({
      access: 'full',
      status: 'active',
      reason: 'active_valid',
      expiresAt: null,
      canWrite: true,
    });
    const subscriptionMock = {
      isTrialActive: signal(false).asReadonly(),
      subscriptionStatus: signal(null).asReadonly(),
      accessState: computed(() => subscriptionState()),
      checkSubscriptionStatus: jasmine.createSpy('checkSubscriptionStatus').and.resolveTo(null),
      ensureCanWrite: jasmine
        .createSpy('ensureCanWrite')
        .and.callFake(() => subscriptionState().canWrite),
      getReadOnlyMessage: jasmine
        .createSpy('getReadOnlyMessage')
        .and.returnValue('Your subscription is read-only. Renew to continue editing.'),
    };

    toastSpy = jasmine.createSpyObj('ToastService', ['show']);
    cashierSessionSpy = jasmine.createSpyObj(
      'CashierSessionService',
      [
        'getShiftModalPrefillData',
        'openSession',
        'closeSession',
        'formatShiftTimeAt',
        'formatShiftDuration',
      ],
      {
        hasActiveSession: signal(false).asReadonly(),
        shiftStatusSince: signal(null).asReadonly(),
        currentSession: signal(null).asReadonly(),
        error: signal(null),
      },
    );
    cashierSessionSpy.getShiftModalPrefillData.and.returnValue(of({ config: [], balances: [] }));
    cashierSessionSpy.openSession.and.returnValue(of(null));
    cashierSessionSpy.closeSession.and.returnValue(of(null));
    cashierSessionSpy.formatShiftTimeAt.and.returnValue('');
    cashierSessionSpy.formatShiftDuration.and.returnValue('');

    await TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CompanyService, useValue: companySpy },
        { provide: AuthService, useValue: authSpy },
        { provide: NotificationService, useClass: MockNotificationService },
        { provide: StockLocationService, useValue: {} },
        {
          provide: AppInitService,
          useValue: jasmine.createSpyObj('AppInitService', ['initializeDashboard', 'clearCache'], {
            isInitializing: signal(false).asReadonly(),
          }),
        },
        { provide: SubscriptionService, useValue: subscriptionMock },
        { provide: ToastService, useValue: toastSpy },
        { provide: NetworkService, useValue: { isOnline: signal(true).asReadonly() } },
        {
          provide: NotificationStateService,
          useValue: {
            markAsRead: jasmine.createSpy('markAsRead'),
            updateNotifications: jasmine.createSpy('updateNotifications'),
            setUnreadCount: jasmine.createSpy('setUnreadCount'),
            unreadCount: signal(0).asReadonly(),
          },
        },
        { provide: CashierSessionService, useValue: cashierSessionSpy },
        {
          provide: ShiftModalTriggerService,
          useValue: {
            open$: EMPTY,
            openOpenModal: jasmine.createSpy('openOpenModal'),
            openCloseModal: jasmine.createSpy('openCloseModal'),
          },
        },
        { provide: RegisterLinkPreviewsService, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardLayoutComponent);
    component = fixture.componentInstance;
    mockAuthService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call auth service logout method', () => {
    component.logout();

    expect(mockAuthService.logout).toHaveBeenCalled();
  });

  it('shows the read-only banner from backend state', () => {
    subscriptionState.set({
      access: 'read_only',
      status: 'expired',
      reason: 'trial_expired',
      expiresAt: '2026-07-01T00:00:00.000Z',
      canWrite: false,
    });

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Read-only mode');
    expect(fixture.nativeElement.textContent).toContain('Renew');
  });

  it('blocks a shell write action when canWrite is false', () => {
    subscriptionState.set({
      access: 'read_only',
      status: 'expired',
      reason: 'trial_expired',
      expiresAt: null,
      canWrite: false,
    });

    component.openOpenDayModal();

    expect(cashierSessionSpy.getShiftModalPrefillData).not.toHaveBeenCalled();
    expect(toastSpy.show).toHaveBeenCalledWith(
      'Read-only mode',
      'Your subscription is read-only. Renew to continue editing.',
      'warning',
      4000,
    );
  });
});

interface SubscriptionHarnessState {
  access: 'full' | 'read_only';
  status: string;
  reason: string;
  expiresAt: string | null;
  canWrite: boolean;
}
