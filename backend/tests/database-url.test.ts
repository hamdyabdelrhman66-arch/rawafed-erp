import { describe, expect, it } from "vitest";
import { buildRuntimeDatabaseUrl, databaseConnectionMode } from "../src/prisma/database-url.js";

describe("runtime PostgreSQL URL", () => {
  it("uses the Neon pooled endpoint at runtime", () => {
    const direct = "postgresql://user:secret@ep-example-123.us-east-1.aws.neon.tech/rawafed?sslmode=require";
    const runtime = buildRuntimeDatabaseUrl(direct);
    const parsed = new URL(runtime!);

    expect(parsed.hostname).toBe("ep-example-123-pooler.us-east-1.aws.neon.tech");
    expect(parsed.searchParams.get("sslmode")).toBe("require");
    expect(parsed.searchParams.get("connection_limit")).toBe("3");
    expect(parsed.searchParams.get("pool_timeout")).toBe("20");
    expect(parsed.searchParams.get("connect_timeout")).toBe("15");
    expect(databaseConnectionMode(runtime)).toBe("pooled");
  });

  it("does not rewrite non-Neon PostgreSQL hosts", () => {
    const runtime = buildRuntimeDatabaseUrl("postgresql://user:secret@db.internal/rawafed");
    expect(new URL(runtime!).hostname).toBe("db.internal");
    expect(databaseConnectionMode(runtime)).toBe("direct");
  });

  it("allows the Neon pooler rewrite to be disabled", () => {
    const runtime = buildRuntimeDatabaseUrl(
      "postgresql://user:secret@ep-example-123.us-east-1.aws.neon.tech/rawafed",
      { useNeonPooler: false },
    );
    expect(new URL(runtime!).hostname).toBe("ep-example-123.us-east-1.aws.neon.tech");
  });

  it("prefers an explicitly configured pooled runtime URL", () => {
    const runtime = buildRuntimeDatabaseUrl(
      "postgresql://user:secret@direct.example/rawafed",
      { poolUrl: "postgresql://user:secret@pool.example/rawafed?connection_limit=7" },
    );
    expect(new URL(runtime!).hostname).toBe("pool.example");
    expect(new URL(runtime!).searchParams.get("connection_limit")).toBe("7");
  });
});
