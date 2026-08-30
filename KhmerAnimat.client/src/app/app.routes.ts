import { Routes } from '@angular/router';

export const routes: Routes = [
  {
  path: 'animate', loadComponent: () => import('./animate/animate')
    .then(mod => mod.Animate)
  }
];
