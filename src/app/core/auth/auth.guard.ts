import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UserRole } from './auth.models';

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allowedRoles = route.data['roles'] as UserRole[] | undefined;
  const session = auth.session();

  if (!session) return router.createUrlTree(['/login']);
  if (auth.canAccess(allowedRoles)) return true;

  return router.createUrlTree([auth.homeForRole(session.role)]);
};
