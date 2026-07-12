import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class InstallmentsRepository {
  constructor(private readonly db: DatabaseClient) {}
  list(customerId: string) {
    return this.db.installment.findMany({
      where: { customerId },
      include: { plan: true },
      orderBy: { dueDate: "asc" },
    });
  }
  createPlan(
    data: Prisma.InstallmentPlanUncheckedCreateInput,
    installments: Prisma.InstallmentUncheckedCreateWithoutPlanInput[],
  ) {
    return this.db.installmentPlan.create({
      data: { ...data, installments: { create: installments } },
      include: { installments: true },
    });
  }
}
