import "dotenv/config";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { selectDatabaseUrl } from "../src/prisma/database-url.js";

export function assertSafeTestDatabase(): string {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Refusing destructive database command: NODE_ENV must equal test.");
  return selectDatabaseUrl(process.env);
}

const invokedDirectly = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invokedDirectly) {
  assertSafeTestDatabase();
  process.stdout.write("Test database guard passed.\n");
}
