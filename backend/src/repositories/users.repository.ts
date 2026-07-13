import type { DatabaseClient } from "./repository.types.js";

const userInclude = { role: true } as const;

export class UsersRepository {
  constructor(private readonly db: DatabaseClient) {}
  findActiveByUsername(username: string) {
    return this.db.user.findFirst({
      where: { username, active: true, deletedAt: null },
      include: userInclude,
    });
  }
  findActiveById(id: string) {
    return this.db.user.findFirst({
      where: { id, active: true, deletedAt: null },
      include: userInclude,
    });
  }
  findById(id: string) {
    return this.db.user.findUnique({ where: { id }, include: userInclude });
  }
  list(skip = 0, take = 100) {
    return this.db.user.findMany({
      where: { deletedAt: null },
      include: userInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }
  findRole(name: string) {
    return this.db.role.findUnique({ where: { name } });
  }
  create(data: {
    username: string;
    email?: string;
    passwordHash: string;
    displayName: string;
    employeeCode?: string;
    phone?: string;
    department?: string;
    jobTitle?: string;
    roleId: string;
  }) {
    return this.db.user.create({ data, include: userInclude });
  }
  update(
    id: string,
    data: {
      displayName?: string;
      email?: string | null;
      employeeCode?: string | null;
      phone?: string | null;
      department?: string | null;
      jobTitle?: string | null;
      roleId?: string;
      passwordHash?: string;
      active?: boolean;
    },
  ) {
    return this.db.user.update({ where: { id }, data, include: userInclude });
  }
  roles() {
    return this.db.role.findMany({ orderBy: { name: "asc" } });
  }
}
