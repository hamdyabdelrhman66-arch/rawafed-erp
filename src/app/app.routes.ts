import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { unsavedChangesGuard } from './core/feedback/unsaved-changes.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent) },
  { path: 'register', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/registration/registration.component').then((m) => m.RegistrationComponent) },
  {
    path: 'scan-registration',
    canActivate: [authGuard],
    data: { roles: ['Super Admin', 'Admissions', 'Registrar'] },
    loadComponent: () => import('./pages/scan-registration/scan-registration.component').then((m) => m.ScanRegistrationComponent)
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    data: { roles: ['Super Admin', 'Admissions', 'Principal'] },
    loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent)
  },
  {
    path: 'students',
    canActivate: [authGuard],
    data: { roles: ['Super Admin', 'Admissions', 'Principal'] },
    loadComponent: () => import('./pages/students/students.component').then((m) => m.StudentsComponent)
  },
  {
    path: 'applications',
    canActivate: [authGuard],
    data: { roles: ['Super Admin', 'Admissions', 'Registrar', 'Principal'] },
    loadComponent: () => import('./pages/applications/applications.component').then((m) => m.ApplicationsComponent)
  },
  {
    path: 'reports',
    canActivate: [authGuard],
    data: { roles: ['Super Admin', 'Principal'] },
    loadComponent: () => import('./pages/reports/reports.component').then((m) => m.ReportsComponent)
  },
  {
    path: 'finance',
    canActivate: [authGuard],
    data: { roles: ['Super Admin', 'Finance', 'Finance Manager', 'Chief Accountant', 'Accountant', 'Auditor'] },
    loadChildren: () => import('./pages/finance/finance.routes').then((m) => m.financeRoutes)
  },
  {
    path: 'admission-letter',
    canActivate: [authGuard],
    data: { roles: ['Super Admin', 'Admissions'] },
    loadComponent: () => import('./pages/admission-letter/admission-letter.component').then((m) => m.AdmissionLetterComponent)
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    data: { roles: ['Super Admin'] },
    loadComponent: () => import('./pages/settings/settings.component').then((m) => m.SettingsComponent)
  },
  {
    path: 'users',
    canActivate: [authGuard],
    data: { roles: ['Super Admin'] },
    loadComponent: () => import('./pages/users/users.component').then((m) => m.UsersComponent)
  },
  {
    path: 'security',
    canActivate: [authGuard],
    data: { roles: ['Super Admin'] },
    loadComponent: () => import('./pages/security/security-audit.component').then((m) => m.SecurityAuditComponent)
  },
  { path: '**', redirectTo: 'login' }
];
