import { Routes } from '@angular/router';
import { authGuard, publicGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Auth flows (public)
  {
    path: 'unlock',
    canActivate: [publicGuard],
    loadComponent: () => import('./features/pin-entry/pin-entry.component').then(m => m.PinEntryComponent),
  },
  {
    path: 'setup-pin',
    loadComponent: () => import('./features/pin-entry/pin-setup.component').then(m => m.PinSetupComponent),
  },
  {
    path: 'setup-recovery',
    loadComponent: () => import('./features/pin-entry/recovery-setup.component').then(m => m.RecoverySetupComponent),
  },
  {
    path: 'recover-pin',
    loadComponent: () => import('./features/pin-entry/pin-recovery.component').then(m => m.PinRecoveryComponent),
  },
  {
    path: 'profile-setup',
    loadComponent: () => import('./features/profile-setup/profile-setup.component').then(m => m.ProfileSetupComponent),
  },

  // App shell (protected)
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell.component').then(m => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'filing/new',
        loadComponent: () => import('./features/filing-wizard/filing-wizard.component').then(m => m.FilingWizardComponent),
      },
      {
        path: 'filing/:id',
        loadComponent: () => import('./features/filing-wizard/filing-wizard.component').then(m => m.FilingWizardComponent),
      },
      {
        path: 'history',
        loadComponent: () => import('./features/filing-history/filing-history.component').then(m => m.FilingHistoryComponent),
      },
      {
        path: 'configuration',
        loadComponent: () => import('./features/configuration/configuration.component').then(m => m.ConfigurationComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
      },
    ],
  },

  // Fallback
  { path: '**', redirectTo: 'unlock' },
];
