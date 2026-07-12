import type { PrismaClient } from "@prisma/client";
import { SupplierRepository } from "../repositories/supplier.repository.js";
export class SupplierService {
  constructor(private readonly prisma: PrismaClient) {}
  list() {
    return new SupplierRepository(this.prisma).list();
  }
  get(id: string) {
    return new SupplierRepository(this.prisma).find(id);
  }
}
