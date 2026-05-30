import {Routes} from '@angular/router';

/**
 * The application is a focused authentication gateway.
 * It exposes a single Firebase phone-auth flow; everything else
 * redirects to the login screen.
 */
export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/firebase-auth/firebase-auth.component').then(m => m.FirebaseAuthComponent)
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];
