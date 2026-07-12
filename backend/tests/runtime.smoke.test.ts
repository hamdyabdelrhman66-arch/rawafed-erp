import { ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = 4399;
const baseUrl = `http://127.0.0.1:${port}`;
let server: ChildProcess;

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
}, 25_000);

afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    once(server, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
});

describe("PostgreSQL runtime API", () => {
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
});
