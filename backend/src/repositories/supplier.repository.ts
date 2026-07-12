import type { DatabaseClient } from "./repository.types.js";
import { SuppliersRepository } from "./parties.repository.js";
export class SupplierRepository extends SuppliersRepository {
  constructor(db: DatabaseClient) {
    super(db);
  }
}
