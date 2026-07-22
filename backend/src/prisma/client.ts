import { Prisma, PrismaClient } from "@prisma/client";
import { requestContext } from "../observability/request-context.js";
import { buildRuntimeDatabaseUrl } from "./database-url.js";

export const runtimeDatabaseUrl = () => buildRuntimeDatabaseUrl(
  process.env.DATABASE_URL || "",
  {
    poolUrl: process.env.DATABASE_POOL_URL,
    useNeonPooler: process.env.DATABASE_USE_NEON_POOLER !== "false",
    connectionLimit: process.env.DATABASE_CONNECTION_LIMIT,
    poolTimeout: process.env.DATABASE_POOL_TIMEOUT,
    connectTimeout: process.env.DATABASE_CONNECT_TIMEOUT,
  },
);

const createClient = () =>
  new PrismaClient({
    datasourceUrl: runtimeDatabaseUrl(),
    log: [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "error" },
    ],
  });
const globalPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
};

export const prisma = globalPrisma.prisma ?? createClient();
prisma.$on("query", (event: Prisma.QueryEvent) =>
  requestContext.recordDatabase(event.duration),
);

if (process.env.NODE_ENV !== "production") globalPrisma.prisma = prisma;

export async function checkDatabaseConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
