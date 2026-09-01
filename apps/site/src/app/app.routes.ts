import { Routes, UrlMatcher } from '@angular/router';

const operationalRoots = new Set([
  'login',
  'register',
  'dashboard',
  'pos',
  'sales',
  'orders',
  'products',
  'customers',
  'suppliers',
  'purchases',
  'money',
  'credit',
  'stock-adjustments',
  'stock-transfers',
  'team',
  'profile',
  'staff-performance',
  'commissions',
  'reports',
  'approvals',
  'settings',
  'billing',
  'notifications',
  'communications',
  'messaging',
  'company',
  'legal',
]);

const operationalUrlMatcher: UrlMatcher = segments =>
  segments.length > 0 && operationalRoots.has(segments[0].path) ? { consumed: segments } : null;

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./marketing/marketing-layout.component').then(m => m.MarketingLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Dukarun | POS and books for Kenyan shops',
        data: {
          description:
            'Know what was sold, what should be in cash and M-Pesa, what customers owe and what stock remains with Dukarun.',
        },
        loadComponent: () => import('./marketing/home/home.component').then(m => m.HomeComponent),
      },
      {
        path: 'about',
        title: 'About | Dukarun',
        data: {
          description: 'Why Dukarun is building practical business software for Kenyan merchants.',
        },
        loadComponent: () =>
          import('./marketing/about/about.component').then(m => m.AboutComponent),
      },
      {
        path: 'contact',
        title: 'Contact | Dukarun',
        data: {
          description: 'Contact the Dukarun team for product, support, or partnership questions.',
        },
        loadComponent: () =>
          import('./marketing/contact/contact.component').then(m => m.ContactComponent),
      },
      {
        path: 'docs/hardware',
        title: 'Barcode scanners and printer setup | Dukarun',
        data: {
          description:
            'Set up phone scanning, USB barcode scanners, label printers, and receipt printers for Dukarun.',
        },
        loadComponent: () =>
          import('./marketing/docs/hardware.component').then(m => m.HardwareComponent),
      },
      {
        path: 'docs',
        title: 'Getting started | Dukarun',
        data: {
          description:
            'Learn how to set up Dukarun, sell, manage pickup and delivery, sync, and close the day.',
        },
        loadComponent: () => import('./marketing/docs/docs.component').then(m => m.DocsComponent),
      },
      {
        path: 'developers/storefront',
        title: 'Storefront API for developers | Dukarun',
        data: {
          description:
            'Read public Dukarun storefront products, variants, prices, categories, and availability from your own website.',
        },
        loadComponent: () =>
          import('./marketing/developers/storefront-api.component').then(
            m => m.StorefrontApiComponent
          ),
      },
      {
        path: 'blog',
        title: 'Business guides | Dukarun',
        data: { description: 'Practical guides for running sales, stock, cash flow, and books.' },
        loadComponent: () => import('./blog/blog-list.component').then(m => m.BlogListComponent),
      },
      {
        path: 'blog/:slug',
        title: 'Dukarun guides',
        data: { description: 'A practical business guide from Dukarun.' },
        loadComponent: () =>
          import('./blog/blog-article.component').then(m => m.BlogArticleComponent),
      },
      {
        path: 'tools/daily-shop-cash-up',
        title: 'Daily Shop Cash-Up Tool | Dukarun',
        data: {
          description:
            'Check expected cash, M-Pesa receipts and closing differences with a free daily cash-up tool for Kenyan shops.',
        },
        loadComponent: () =>
          import('./tools/daily-shop-cash-up/daily-shop-cash-up.component').then(
            m => m.DailyShopCashUpComponent
          ),
      },
      {
        path: 'privacy',
        title: 'Privacy Notice | Dukarun',
        data: { documentType: 'privacy', description: 'Current Dukarun Privacy Notice.' },
        loadComponent: () => import('./legal/legal-page.component').then(m => m.LegalPageComponent),
      },
      {
        path: 'terms',
        title: 'Terms of Service | Dukarun',
        data: { documentType: 'terms', description: 'Current Dukarun Terms of Service.' },
        loadComponent: () => import('./legal/legal-page.component').then(m => m.LegalPageComponent),
      },
      {
        path: 'dpa',
        title: 'Data Processing Addendum | Dukarun',
        data: { documentType: 'dpa', description: 'Current Dukarun Data Processing Addendum.' },
        loadComponent: () => import('./legal/legal-page.component').then(m => m.LegalPageComponent),
      },
      {
        path: 'subprocessors',
        title: 'Subprocessors | Dukarun',
        data: { documentType: 'subprocessors', description: 'Current Dukarun subprocessor list.' },
        loadComponent: () => import('./legal/legal-page.component').then(m => m.LegalPageComponent),
      },
    ],
  },
  {
    matcher: operationalUrlMatcher,
    loadComponent: () =>
      import('./core/operational-redirect.component').then(m => m.OperationalRedirectComponent),
  },
  { path: '**', redirectTo: '' },
];
