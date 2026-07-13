import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import {
  CreateManagedUser,
  ManagedUser,
  SystemRole,
  UserAdminService,
} from "../../core/users/user-admin.service";

const emptyForm = (): CreateManagedUser & { confirmPassword: string } => ({
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  displayName: "",
  employeeCode: "",
  phone: "",
  department: "",
  jobTitle: "",
  role: "",
});

@Component({
  selector: "raw-users",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./users.component.html",
  styleUrl: "./users.component.scss",
})
export class UsersComponent implements OnInit {
  users: ManagedUser[] = [];
  roles: SystemRole[] = [];
  form = emptyForm();
  search = "";
  loading = true;
  saving = false;
  showPassword = false;
  message = "";
  error = "";

  constructor(private readonly userAdmin: UserAdminService) {}

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  get filteredUsers(): ManagedUser[] {
    const query = this.search.trim().toLowerCase();
    if (!query) return this.users;
    return this.users.filter((user) =>
      [
        user.displayName,
        user.username,
        user.email,
        user.employeeCode,
        user.department,
        user.jobTitle,
        user.role,
      ].some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }

  get passwordValid(): boolean {
    const password = this.form.password;
    return (
      password.length >= 12 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password)
    );
  }

  async reload(): Promise<void> {
    this.loading = true;
    this.error = "";
    try {
      [this.users, this.roles] = await Promise.all([
        this.userAdmin.list(),
        this.userAdmin.roles(),
      ]);
      if (!this.form.role) this.form.role = this.roles[0]?.name || "";
    } catch (error: any) {
      this.error = error?.safeMessage || error?.message || "تعذر تحميل المستخدمين.";
    } finally {
      this.loading = false;
    }
  }

  async createUser(): Promise<void> {
    this.error = "";
    this.message = "";
    if (!this.passwordValid) {
      this.error = "كلمة المرور يجب أن تكون 12 حرفًا وتحتوي على حرف كبير وصغير ورقم ورمز.";
      return;
    }
    if (this.form.password !== this.form.confirmPassword) {
      this.error = "كلمتا المرور غير متطابقتين.";
      return;
    }
    this.saving = true;
    try {
      const { confirmPassword: _confirm, ...input } = this.form;
      await this.userAdmin.create(input);
      this.form = emptyForm();
      this.form.role = this.roles[0]?.name || "";
      this.message = "تم إنشاء حساب الموظف بنجاح.";
      await this.reload();
    } catch (error: any) {
      this.error = error?.safeMessage || error?.message || "تعذر إنشاء المستخدم.";
    } finally {
      this.saving = false;
    }
  }

  async toggleStatus(user: ManagedUser): Promise<void> {
    this.error = "";
    try {
      await this.userAdmin.setStatus(user.id, !user.active);
      this.message = user.active ? "تم إيقاف الحساب." : "تم تفعيل الحساب.";
      await this.reload();
    } catch (error: any) {
      this.error = error?.safeMessage || error?.message || "تعذر تحديث الحساب.";
    }
  }
}
