import type { PrismaClient } from "@prisma/client";
import { UsersRepository } from "../repositories/users.repository.js";

export class SessionService {
  constructor(private readonly prisma: PrismaClient) {}
  async isActive(userId: string): Promise<boolean> {
    return Boolean(
      await new UsersRepository(this.prisma).findActiveById(userId),
    );
  }
}
