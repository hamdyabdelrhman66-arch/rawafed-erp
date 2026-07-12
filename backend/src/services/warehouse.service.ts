import type { PrismaClient } from "@prisma/client";
import { WarehouseRepository } from "../repositories/warehouse.repository.js";
export class WarehouseService {
  constructor(private readonly prisma: PrismaClient) {}
  list() {
    return new WarehouseRepository(this.prisma).list();
  }
  create(input: any) {
    return this.prisma.$transaction((tx) =>
      new WarehouseRepository(tx).create({
        code: input.code || `WH-${Date.now()}`,
        name: input.name || input.nameEn,
        nameAr: input.nameAr,
        location: input.location,
        responsibleEmployee: input.responsibleEmployee,
        description: input.description,
        active: input.status !== "inactive",
      }),
    );
  }
  update(id: string, input: any) {
    return this.prisma.$transaction((tx) =>
      new WarehouseRepository(tx).update(id, {
        code: input.code,
        name: input.name || input.nameEn,
        nameAr: input.nameAr,
        location: input.location,
        responsibleEmployee: input.responsibleEmployee,
        description: input.description,
        active: input.status ? input.status === "active" : undefined,
      }),
    );
  }
}
