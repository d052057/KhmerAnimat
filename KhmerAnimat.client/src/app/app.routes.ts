import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'khmerlogo', loadComponent: () => import('./khmer-logo/khmer-logo')
      .then(mod => mod.KhmerLogo)
  }
];
