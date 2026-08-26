import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./directory.component').then(m => m.DirectoryComponent),
  },
  {
    path: 'track/:token',
    loadComponent: () => import('./tracking.component').then(m => m.TrackingComponent),
  },
  {
    path: 'statement/:token',
    loadComponent: () => import('./statement.component').then(m => m.StatementComponent),
  },
  {
    path: 'document/:token',
    loadComponent: () => import('./document.component').then(m => m.DocumentComponent),
  },
  {
    path: ':slug/products/:productId',
    loadComponent: () => import('./product-detail.component').then(m => m.ProductDetailComponent),
  },
  {
    path: ':slug',
    loadComponent: () => import('./shop.component').then(m => m.ShopComponent),
  },
  { path: '**', redirectTo: '' },
];
