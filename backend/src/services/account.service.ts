import type { AccountType, PrismaClient } from "@prisma/client";
import {
  AccountsRepository,
  CostCentersRepository,
} from "../repositories/accounts.repository.js";
import { ServiceError } from "./service.error.js";

const shape = (a: any) => ({
  id: a.id,
  code: a.code,
  nameAr: a.nameAr || a.name,
  nameEn: a.name,
  accountType: a.type.toLowerCase(),
  parentId: a.parentId,
  openingBalance: Number(a.openingBalance),
  openingDate: a.openingDate?.toISOString().slice(0, 10),
  currency: a.currency,
  costCenterId: a.costCenterId,
  status: a.active ? "active" : "inactive",
  notes: a.notes,
  systemKey: a.systemKey,
  isCashAccount: a.isCashAccount,
  isBankAccount: a.isBankAccount,
  isVatAccount: a.isVatAccount,
  isReceivableAccount: a.isReceivableAccount,
  isPayableAccount: a.isPayableAccount,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});
export class AccountService {
  constructor(private readonly prisma: PrismaClient) {}
  async list(types?: AccountType[]) {
    return (
      await new AccountsRepository(this.prisma).list(
        types ? { type: { in: types }, active: true } : {},
      )
    ).map(shape);
  }
  async costCenters() {
    return new CostCentersRepository(this.prisma).list();
  }
  async create(input: any) {
    const row = await new AccountsRepository(this.prisma).create({
      code: input.code,
      name: input.nameEn,
      nameAr: input.nameAr,
      type: String(input.accountType).toUpperCase(),
      parentId: input.parentId || null,
      openingBalance: Number(input.openingBalance || 0),
      openingDate: input.openingDate ? new Date(input.openingDate) : null,
      currency: input.currency || "SAR",
      costCenterId: input.costCenterId || null,
      notes: input.notes,
      active: input.status !== "inactive",
    } as any);
    return shape(row);
  }
  async update(id: string, input: any) {
    return shape(
      await new AccountsRepository(this.prisma).update(id, {
        name: input.nameEn,
        nameAr: input.nameAr,
        parentId: input.parentId,
        costCenterId: input.costCenterId,
        notes: input.notes,
        active: input.status ? input.status === "active" : undefined,
      }),
    );
  }
  async archive(id: string) {
    const repo = new AccountsRepository(this.prisma);
    if ((await repo.children(id)) || (await repo.lines(id)))
      throw new ServiceError(
        "Account has child accounts or posted journal lines and cannot be deleted.",
        422,
      );
    return shape(
      await repo.update(id, { active: false, deletedAt: new Date() }),
    );
  }
  async move(id: string, parentId: string | null) {
    if (id === parentId)
      throw new ServiceError("Account cannot be its own parent.", 422);
    return shape(
      await new AccountsRepository(this.prisma).update(id, { parentId }),
    );
  }
  async suggest(parentId = "", type = "asset") {
    const repo = new AccountsRepository(this.prisma);
    const parent = parentId ? await repo.find(parentId) : null;
    const prefix =
      parent?.code ||
      (
        {
          asset: "1",
          liability: "2",
          equity: "3",
          revenue: "4",
          expense: "5",
        } as any
      )[type] ||
      "9";
    const latest = await repo.nextCode(prefix);
    return { code: String(Number(latest?.code || `${prefix}000`) + 1) };
  }
}
