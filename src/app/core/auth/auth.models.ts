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
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  token?: string;
  refreshToken?: string;
}
