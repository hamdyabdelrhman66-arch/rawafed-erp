import { Prisma, PrismaClient } from "@prisma/client";
import { requestContext } from "../observability/request-context.js";

const databaseUrl = () => {
  const raw = process.env.DATABASE_URL || "";
  if (!raw) return undefined;
  const url = new URL(raw);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", process.env.DATABASE_CONNECTION_LIMIT || "5");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", process.env.DATABASE_POOL_TIMEOUT || "10");
  if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", process.env.DATABASE_CONNECT_TIMEOUT || "10");
  return url.toString();
};

const createClient = () =>
  new PrismaClient({
    datasourceUrl: databaseUrl(),
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
