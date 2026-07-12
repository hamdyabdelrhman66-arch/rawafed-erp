import { ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";

const port = 4399;
const baseUrl = `http://127.0.0.1:${port}`;
let server: ChildProcess;
const username = `runtime-${randomUUID().slice(0, 12)}`;
const password = `Runtime!${randomUUID()}Aa1`;
let userId = "";

async function startServer(): Promise<void> {
  server = spawn(process.execPath, ["dist/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PERSISTENCE_DRIVER: "postgres",
      PORT: String(port),
    },
    stdio: "ignore",
  });
  await waitForServer();
}

async function stopServer(): Promise<void> {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    once(server, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        "The backend exited before its health endpoint became available.",
      );
    }

    try {
      const response = await fetch(`${baseUrl}/api/live`);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("The backend did not become available within 20 seconds.");
}

beforeAll(async () => {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: "Super Admin" } });
  const user = await prisma.user.create({
    data: {
      username,
      displayName: "Runtime Test Administrator",
      passwordHash: await bcrypt.hash(password, 4),
      roleId: role.id,
    },
  });
  userId = user.id;
  await startServer();
}, 25_000);

afterAll(async () => {
  await stopServer();
  if (userId) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "user", entityId: userId },
    });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

describe.sequential("PostgreSQL runtime API", () => {
  it("serves the public service descriptor", async () => {
    const response = await fetch(baseUrl);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      service: "rawafed-backend",
      api: "/api",
    });
  });

  it("reports process liveness", async () => {
    const response = await fetch(`${baseUrl}/api/live`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("reports PostgreSQL-backed readiness", async () => {
    const response = await fetch(`${baseUrl}/api/ready`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  }, 15_000);

  it("preserves the standardized API error contract", async () => {
    const response = await fetch(`${baseUrl}/api/not-a-real-endpoint`);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({ success: false, errorCode: "NOT_FOUND" });
    expect(body.requestId).toEqual(expect.any(String));
  });

  it("executes login, refresh, logout, and refresh-token revocation", async () => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const session = await login.json();
    expect(login.status).toBe(200);
    expect(session.token).toEqual(expect.any(String));
    expect(session.refreshToken).toEqual(expect.any(String));

    const refresh = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(refresh.status).toBe(200);

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(logout.status).toBe(204);

    const revoked = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(revoked.status).toBe(401);
  });

  it("persists a saved report template across a backend restart", async () => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const session = await login.json();
    const marker = `Restart ${randomUUID()}`;
    const create = await fetch(`${baseUrl}/api/reports/templates`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        name: marker,
        reportType: "accounting",
        filters: { quarter: "Q1", year: "2026" },
        columns: ["metric", "amount"],
        chartType: "bar",
      }),
    });
    const template = await create.json();
    expect(create.status).toBe(201);

    await stopServer();
    await startServer();

    const list = await fetch(`${baseUrl}/api/reports/templates`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    const templates = await list.json();
    expect(list.status).toBe(200);
    expect(templates.some((item: { id: string; name: string }) => item.id === template.id && item.name === marker)).toBe(true);

    const remove = await fetch(`${baseUrl}/api/reports/templates/${template.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${session.token}` },
    });
    expect(remove.status).toBe(204);
  }, 30_000);
});
