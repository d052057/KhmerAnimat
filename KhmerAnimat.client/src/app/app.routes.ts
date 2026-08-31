import { Routes } from '@angular/router';

export const routes: Routes = [
  {
  path: 'animate', loadComponent: () => import('./animate/animate')
    .then(mod => mod.Animate)
  },
  {
    path: 'khmerlogo', loadComponent: () => import('./khmer-logo/khmer-logo')
      .then(mod => mod.KhmerLogo)
  }
];
