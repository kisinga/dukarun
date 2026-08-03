import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'products/:slug',
    loadComponent: () => import('./pages/product/product.component').then(m => m.ProductComponent),
  },
  {
    path: 'collections/:slug',
    loadComponent: () =>
      import('./pages/collection/collection.component').then(m => m.CollectionComponent),
  },
  { path: '**', redirectTo: '' },
];
