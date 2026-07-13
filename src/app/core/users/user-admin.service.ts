import { Injectable } from "@angular/core";
import { ApiService } from "../api/api.service";

export interface ManagedUser {
  id: string;
  username: string;
  email?: string | null;
  displayName: string;
  employeeCode?: string | null;
  phone?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  role: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemRole {
  id: string;
  name: string;
  description?: string | null;
}

export interface CreateManagedUser {
  username: string;
  email: string;
  password: string;
  displayName: string;
  employeeCode?: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  role: string;
}

@Injectable({ providedIn: "root" })
export class UserAdminService {
  constructor(private readonly api: ApiService) {}

  list() {
    return this.api.get<ManagedUser[]>("/users?limit=200");
  }

  roles() {
    return this.api.get<SystemRole[]>("/roles");
  }

  create(input: CreateManagedUser) {
    return this.api.post<ManagedUser>("/users", input);
  }

  setStatus(id: string, active: boolean) {
    return this.api.patch<ManagedUser>(`/users/${id}/status`, { active });
  }
}
