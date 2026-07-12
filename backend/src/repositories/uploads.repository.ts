import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class UploadsRepository {
  constructor(private readonly db: DatabaseClient) {}
  create(data: Prisma.UploadedFileUncheckedCreateInput) {
    return this.db.uploadedFile.create({ data });
  }
  findById(id: string) {
    return this.db.uploadedFile.findFirst({ where: { id, deletedAt: null } });
  }
  softDelete(id: string) {
    return this.db.uploadedFile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
