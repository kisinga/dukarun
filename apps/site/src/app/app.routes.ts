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
        title: 'Dukarun | POS and books for Kenyan businesses',
        data: {
          description:
            'Sell online or offline, manage stock, and keep balanced books with Dukarun.',
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
        path: 'docs',
        title: 'Getting started | Dukarun',
        data: { description: 'Learn how to set up Dukarun, sell, sync, and close the day.' },
        loadComponent: () => import('./marketing/docs/docs.component').then(m => m.DocsComponent),
      },
      {
        path: 'blog',
        title: 'Business guides | Dukarun',
        data: { description: 'Practical guides for running sales, stock, cash flow, and books.' },
        loadComponent: () => import('./blog/blog-list.component').then(m => m.BlogListComponent),
      },
      {
        path: 'blog/:slug',
        title: 'Dukarun journal',
        data: { description: 'A practical business guide from Dukarun.' },
        loadComponent: () =>
          import('./blog/blog-article.component').then(m => m.BlogArticleComponent),
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
