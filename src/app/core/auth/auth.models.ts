export type UserRole =
  | 'Super Admin'
  | 'Admissions'
  | 'Finance'
  | 'Principal'
  | 'Registrar'
  | 'Finance Manager'
  | 'Chief Accountant'
  | 'Accountant'
  | 'Auditor';

export interface AuthUser {
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
}

export interface AuthSession {
  username: string;
  displayName: string;
  role: UserRole;
  token?: string;
  refreshToken?: string;
}
