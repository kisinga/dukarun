import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./directory.component').then(m => m.DirectoryComponent),
  },
  {
    path: ':slug',
    loadComponent: () => import('./shop.component').then(m => m.ShopComponent),
  },
  { path: '**', redirectTo: '' },
];
