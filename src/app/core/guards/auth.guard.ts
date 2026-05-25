import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isUnlocked()) return true;

  const state = auth.state();
  if (state === 'needs_pin_setup') {
    return router.createUrlTree(['/setup-pin']);
  }
  if (state === 'needs_profile') {
    return router.createUrlTree(['/profile-setup']);
  }
  return router.createUrlTree(['/unlock']);
};

export const publicGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isUnlocked()) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
