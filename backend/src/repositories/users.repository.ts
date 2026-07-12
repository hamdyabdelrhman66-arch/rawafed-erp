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
    passwordHash: string;
    displayName: string;
    roleId: string;
  }) {
    return this.db.user.create({ data, include: userInclude });
  }
  update(
    id: string,
    data: {
      displayName?: string;
      roleId?: string;
      passwordHash?: string;
      active?: boolean;
    },
  ) {
    return this.db.user.update({ where: { id }, data, include: userInclude });
  }
}
