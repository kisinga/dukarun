import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./directory.component').then(m => m.DirectoryComponent),
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
    path: ':slug',
    loadComponent: () => import('./shop.component').then(m => m.ShopComponent),
  },
  { path: '**', redirectTo: '' },
];
