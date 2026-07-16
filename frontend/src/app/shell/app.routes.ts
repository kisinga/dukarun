import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from './guards/auth.guard';
import { cashierGuard } from './guards/cashier.guard';
import { creditGuard } from './guards/credit.guard';
import { financialsGuard } from './guards/financials.guard';
import { productGuard } from './guards/product.guard';
import { settingsGuard } from './guards/settings.guard';
import { stockAdjustmentGuard } from './guards/stock-adjustment.guard';

export const routes: Routes = [
  // Marketing pages (include their own navbar/footer)
  {
    path: '',
    loadComponent: () => import('../pages/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'login',
    canActivate: [noAuthGuard],
    loadComponent: () =>
      import('../pages/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    canActivate: [noAuthGuard],
    loadComponent: () =>
      import('../pages/auth/signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'features',
    loadComponent: () =>
      import('../pages/features/features.component').then((m) => m.FeaturesComponent),
  },
  {
    path: 'pricing',
    loadComponent: () =>
      import('../pages/pricing/pricing.component').then((m) => m.PricingComponent),
  },
  {
    path: 'about',
    loadComponent: () => import('../pages/about/about.component').then((m) => m.AboutComponent),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('../pages/contact/contact.component').then((m) => m.ContactComponent),
  },
  {
    path: 'support',
    loadComponent: () =>
      import('../pages/support/support.component').then((m) => m.SupportComponent),
  },
  {
    path: 'onboarding',
    loadComponent: () =>
      import('../pages/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('../pages/privacy/privacy.component').then((m) => m.PrivacyComponent),
  },
  {
    path: 'terms',
    loadComponent: () => import('../pages/terms/terms.component').then((m) => m.TermsComponent),
  },

  // Dashboard - separate layout with sidebar and mobile bottom nav
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/dashboard-layout.component').then((m) => m.DashboardLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('../pages/overview/overview.component').then((m) => m.OverviewComponent),
      },
      {
        path: 'sell',
        loadComponent: () => import('../pages/sell/sell.component').then((m) => m.SellComponent),
      },
      {
        path: 'cashier',
        canActivate: [cashierGuard],
        loadComponent: () =>
          import('../pages/cashier/cashier.component').then((m) => m.CashierComponent),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('../pages/products/products.component').then((m) => m.ProductsComponent),
      },
      {
        path: 'products/analytics',
        loadComponent: () =>
          import('../pages/products/analytics/product-analytics-page.component').then(
            (m) => m.ProductAnalyticsPageComponent,
          ),
      },
      {
        path: 'products/create',
        canActivate: [productGuard],
        loadComponent: () =>
          import('../pages/product-create/product-create.component').then(
            (m) => m.ProductCreateComponent,
          ),
      },
      {
        path: 'products/edit/:id',
        canActivate: [productGuard],
        loadComponent: () =>
          import('../pages/product-create/product-create.component').then(
            (m) => m.ProductCreateComponent,
          ),
      },
      {
        path: 'products/:id',
        loadComponent: () =>
          import('../pages/products/product-detail/product-detail.component').then(
            (m) => m.ProductDetailComponent,
          ),
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('../pages/customers/customers.component').then((m) => m.CustomersComponent),
      },
      {
        path: 'credit',
        canActivate: [creditGuard],
        loadComponent: () =>
          import('../pages/credit/credit.component').then((m) => m.CreditComponent),
      },
      {
        path: 'customers/create',
        loadComponent: () =>
          import('../pages/customer-create/customer-create.component').then(
            (m) => m.CustomerCreateComponent,
          ),
      },
      {
        path: 'customers/edit/:id',
        loadComponent: () =>
          import('../pages/customer-edit/customer-edit.component').then(
            (m) => m.CustomerEditComponent,
          ),
      },
      {
        path: 'customers/:id/statement',
        loadComponent: () =>
          import('../pages/customers/customer-statement/customer-statement.component').then(
            (m) => m.CustomerStatementComponent,
          ),
      },
      {
        path: 'customers/:id',
        loadComponent: () =>
          import('../pages/customers/customer-detail/customer-detail.component').then(
            (m) => m.CustomerDetailComponent,
          ),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('../pages/orders/orders.component').then((m) => m.OrdersComponent),
      },
      {
        path: 'orders/:id',
        loadComponent: () =>
          import('../pages/orders/order-detail/order-detail-page.component').then(
            (m) => m.OrderDetailPageComponent,
          ),
      },
      {
        path: 'orders/edit/:id',
        loadComponent: () =>
          import('../pages/orders/order-edit/order-edit.component').then(
            (m) => m.OrderEditComponent,
          ),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('../pages/payments/payments.component').then((m) => m.PaymentsComponent),
      },
      { path: 'expenses', redirectTo: 'accounting/expenses', pathMatch: 'full' },
      {
        path: 'payments/:id',
        loadComponent: () =>
          import('../pages/payments/payment-detail/payment-detail.component').then(
            (m) => m.PaymentDetailComponent,
          ),
      },
      {
        path: 'suppliers',
        loadComponent: () =>
          import('../pages/suppliers/suppliers.component').then((m) => m.SuppliersComponent),
      },
      {
        path: 'suppliers/create',
        loadComponent: () =>
          import('../pages/supplier-create/supplier-create.component').then(
            (m) => m.SupplierCreateComponent,
          ),
      },
      {
        path: 'suppliers/edit/:id',
        loadComponent: () =>
          import('../pages/supplier-create/supplier-create.component').then(
            (m) => m.SupplierCreateComponent,
          ),
      },
      {
        path: 'suppliers/:id',
        loadComponent: () =>
          import('../pages/suppliers/supplier-detail/supplier-detail.component').then(
            (m) => m.SupplierDetailComponent,
          ),
      },
      {
        path: 'purchases',
        loadComponent: () =>
          import('../pages/purchases/purchases.component').then((m) => m.PurchasesComponent),
      },
      {
        path: 'purchases/create',
        loadComponent: () =>
          import('../pages/purchase-create/purchase-create.component').then(
            (m) => m.PurchaseCreateComponent,
          ),
      },
      {
        path: 'purchases/edit/:id',
        loadComponent: () =>
          import('../pages/purchase-edit/purchase-edit.component').then(
            (m) => m.PurchaseEditComponent,
          ),
      },
      {
        path: 'purchases/:id',
        loadComponent: () =>
          import('../pages/purchases/purchase-detail/purchase-detail.component').then(
            (m) => m.PurchaseDetailComponent,
          ),
      },
      {
        path: 'approvals',
        loadComponent: () =>
          import('../pages/approvals/approvals.component').then((m) => m.ApprovalsComponent),
      },
      {
        path: 'profile',
        loadChildren: () => import('../pages/profile/profile.routes').then((m) => m.PROFILE_ROUTES),
      },
      {
        path: 'accounting',
        canActivate: [financialsGuard],
        loadComponent: () =>
          import('../pages/accounting/accounting-layout.component').then(
            (m) => m.AccountingLayoutComponent,
          ),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'ledger' },
          {
            path: 'ledger',
            canActivate: [financialsGuard],
            loadComponent: () =>
              import('../pages/accounting/accounting.component').then((m) => m.AccountingComponent),
          },
          {
            path: 'expenses',
            canActivate: [financialsGuard],
            loadComponent: () =>
              import('../pages/expenses/expenses.component').then((m) => m.ExpensesComponent),
          },
          {
            path: 'transfers',
            canActivate: [financialsGuard],
            loadComponent: () =>
              import('../pages/accounting/transfers.component').then((m) => m.TransfersComponent),
          },
        ],
      },
      {
        path: 'stock-adjustments',
        canActivate: [stockAdjustmentGuard],
        loadComponent: () =>
          import('../pages/stock-adjustments/stock-adjustments.component').then(
            (m) => m.StockAdjustmentsComponent,
          ),
      },
      {
        path: 'stock-adjustments/create',
        canActivate: [stockAdjustmentGuard],
        loadComponent: () =>
          import('../pages/stock-adjustments/stock-adjustment-create/stock-adjustment-create.component').then(
            (m) => m.StockAdjustmentCreateComponent,
          ),
      },
      {
        path: 'settings',
        canActivate: [settingsGuard],
        loadComponent: () =>
          import('../pages/settings/settings-layout.component').then(
            (m) => m.SettingsLayoutComponent,
          ),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'notifications' },
          {
            path: 'notifications',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('../pages/settings/components/notification-settings/notification-settings.component').then(
                (m) => m.NotificationSettingsComponent,
              ),
          },
          {
            path: 'test-notifications',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('../pages/settings/components/notification-test/notification-test.component').then(
                (m) => m.NotificationTestComponent,
              ),
          },
        ],
      },
      {
        path: 'admin',
        canActivate: [settingsGuard],
        loadComponent: () =>
          import('../pages/admin/admin-layout.component').then((m) => m.AdminLayoutComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'general' },
          {
            path: 'general',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('../pages/settings/components/general-settings/general-settings.component').then(
                (m) => m.GeneralSettingsComponent,
              ),
          },
          {
            path: 'shifts',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('../pages/shifts/shifts.component').then((m) => m.ShiftsComponent),
          },
          {
            path: 'audit-trail',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('../pages/settings/components/audit-trail/audit-trail.component').then(
                (m) => m.AuditTrailComponent,
              ),
          },
          {
            path: 'subscription',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('../pages/settings/subscription-tab.component').then(
                (m) => m.SubscriptionTabComponent,
              ),
          },
          {
            path: 'payment-methods',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('../pages/settings/components/payment-methods/payment-methods.component').then(
                (m) => m.PaymentMethodsComponent,
              ),
          },
          {
            path: 'team',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('../pages/team/team.component').then((m) => m.TeamComponent),
          },
        ],
      },
    ],
  },

  {
    path: '**',
    redirectTo: '',
  },
];
