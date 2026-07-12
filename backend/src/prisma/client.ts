import { Prisma, PrismaClient } from "@prisma/client";
import { requestContext } from "../observability/request-context.js";

const createClient = () =>
  new PrismaClient({
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
