import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from './core/guards/auth.guard';
import { creditGuard } from './core/guards/credit.guard';
import { settingsGuard } from './core/guards/settings.guard';
import { stockAdjustmentGuard } from './core/guards/stock-adjustment.guard';

export const routes: Routes = [
  // Marketing pages (include their own navbar/footer)
  {
    path: '',
    loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'login',
    canActivate: [noAuthGuard],
    loadComponent: () => import('./pages/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    canActivate: [noAuthGuard],
    loadComponent: () =>
      import('./pages/auth/signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'features',
    loadComponent: () =>
      import('./pages/features/features.component').then((m) => m.FeaturesComponent),
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about.component').then((m) => m.AboutComponent),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./pages/contact/contact.component').then((m) => m.ContactComponent),
  },
  {
    path: 'support',
    loadComponent: () =>
      import('./pages/support/support.component').then((m) => m.SupportComponent),
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./pages/privacy/privacy.component').then((m) => m.PrivacyComponent),
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms/terms.component').then((m) => m.TermsComponent),
  },

  // Dashboard - separate layout with sidebar and mobile bottom nav
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/layout/dashboard-layout.component').then(
        (m) => m.DashboardLayoutComponent,
      ),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./dashboard/pages/overview/overview.component').then((m) => m.OverviewComponent),
      },
      {
        path: 'sell',
        loadComponent: () =>
          import('./dashboard/pages/sell/sell.component').then((m) => m.SellComponent),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./dashboard/pages/products/products.component').then((m) => m.ProductsComponent),
      },
      {
        path: 'products/create',
        loadComponent: () =>
          import('./dashboard/pages/product-create/product-create.component').then(
            (m) => m.ProductCreateComponent,
          ),
      },
      {
        path: 'products/edit/:id',
        loadComponent: () =>
          import('./dashboard/pages/product-create/product-create.component').then(
            (m) => m.ProductCreateComponent,
          ),
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./dashboard/pages/customers/customers.component').then(
            (m) => m.CustomersComponent,
          ),
      },
      {
        path: 'credit',
        canActivate: [creditGuard],
        loadComponent: () =>
          import('./dashboard/pages/credit/credit.component').then((m) => m.CreditComponent),
      },
      {
        path: 'customers/create',
        loadComponent: () =>
          import('./dashboard/pages/customer-create/customer-create.component').then(
            (m) => m.CustomerCreateComponent,
          ),
      },
      {
        path: 'customers/edit/:id',
        loadComponent: () =>
          import('./dashboard/pages/customer-edit/customer-edit.component').then(
            (m) => m.CustomerEditComponent,
          ),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./dashboard/pages/orders/orders.component').then((m) => m.OrdersComponent),
      },
      {
        path: 'orders/:id',
        loadComponent: () =>
          import('./dashboard/pages/orders/order-detail/order-detail.component').then(
            (m) => m.OrderDetailComponent,
          ),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./dashboard/pages/payments/payments.component').then((m) => m.PaymentsComponent),
      },
      {
        path: 'payments/:id',
        loadComponent: () =>
          import('./dashboard/pages/payments/payment-detail/payment-detail.component').then(
            (m) => m.PaymentDetailComponent,
          ),
      },
      {
        path: 'suppliers',
        loadComponent: () =>
          import('./dashboard/pages/suppliers/suppliers.component').then(
            (m) => m.SuppliersComponent,
          ),
      },
      {
        path: 'suppliers/create',
        loadComponent: () =>
          import('./dashboard/pages/supplier-create/supplier-create.component').then(
            (m) => m.SupplierCreateComponent,
          ),
      },
      {
        path: 'suppliers/edit/:id',
        loadComponent: () =>
          import('./dashboard/pages/supplier-edit/supplier-edit.component').then(
            (m) => m.SupplierEditComponent,
          ),
      },
      {
        path: 'purchases',
        loadComponent: () =>
          import('./dashboard/pages/purchases/purchases.component').then(
            (m) => m.PurchasesComponent,
          ),
      },
      {
        path: 'purchases/create',
        loadComponent: () =>
          import('./dashboard/pages/purchase-create/purchase-create.component').then(
            (m) => m.PurchaseCreateComponent,
          ),
      },
      {
        path: 'profile',
        loadChildren: () =>
          import('./dashboard/pages/profile/profile.routes').then((m) => m.PROFILE_ROUTES),
      },
      { path: 'accounting', redirectTo: 'admin/accounting', pathMatch: 'full' },
      {
        path: 'stock-adjustments',
        canActivate: [stockAdjustmentGuard],
        loadComponent: () =>
          import('./dashboard/pages/stock-adjustments/stock-adjustments.component').then(
            (m) => m.StockAdjustmentsComponent,
          ),
      },
      {
        path: 'settings',
        canActivate: [settingsGuard],
        loadComponent: () =>
          import('./dashboard/pages/settings/settings-layout.component').then(
            (m) => m.SettingsLayoutComponent,
          ),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'notifications' },
          {
            path: 'notifications',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('./dashboard/pages/settings/components/notification-settings/notification-settings.component').then(
                (m) => m.NotificationSettingsComponent,
              ),
          },
          {
            path: 'test-notifications',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('./dashboard/pages/settings/components/notification-test/notification-test.component').then(
                (m) => m.NotificationTestComponent,
              ),
          },
        ],
      },
      {
        path: 'admin',
        canActivate: [settingsGuard],
        loadComponent: () =>
          import('./dashboard/pages/admin/admin-layout.component').then(
            (m) => m.AdminLayoutComponent,
          ),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'general' },
          {
            path: 'general',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('./dashboard/pages/settings/components/general-settings/general-settings.component').then(
                (m) => m.GeneralSettingsComponent,
              ),
          },
          {
            path: 'shifts',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('./dashboard/pages/shifts/shifts.component').then((m) => m.ShiftsComponent),
          },
          {
            path: 'audit-trail',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('./dashboard/pages/settings/components/audit-trail/audit-trail.component').then(
                (m) => m.AuditTrailComponent,
              ),
          },
          {
            path: 'accounting',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('./dashboard/pages/accounting/accounting.component').then(
                (m) => m.AccountingComponent,
              ),
          },
          {
            path: 'subscription',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('./dashboard/pages/settings/subscription-tab.component').then(
                (m) => m.SubscriptionTabComponent,
              ),
          },
          {
            path: 'ml-model',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('./dashboard/pages/settings/components/ml-model-status/ml-model-status.component').then(
                (m) => m.MlModelStatusComponent,
              ),
          },
          {
            path: 'payment-methods',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('./dashboard/pages/settings/components/payment-methods/payment-methods.component').then(
                (m) => m.PaymentMethodsComponent,
              ),
          },
          {
            path: 'team',
            canActivate: [settingsGuard],
            loadComponent: () =>
              import('./dashboard/pages/team/team.component').then((m) => m.TeamComponent),
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
