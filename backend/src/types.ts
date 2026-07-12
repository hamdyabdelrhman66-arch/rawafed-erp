export type UserRole =
  | "Super Admin"
  | "Admissions"
  | "Finance"
  | "Principal"
  | "Registrar"
  | "Finance Manager"
  | "Chief Accountant"
  | "Accountant"
  | "Auditor";
export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
