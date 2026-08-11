export interface RuntimeDatabaseUrlOptions {
  poolUrl?: string;
  useNeonPooler?: boolean;
  connectionLimit?: string;
  poolTimeout?: string;
  connectTimeout?: string;
}

export interface DatabaseEnvironment {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  TEST_DATABASE_URL?: string;
  PRODUCTION_DATABASE_URL?: string;
  TEST_DATABASE_ALLOWLIST?: string;
  ALLOW_DESTRUCTIVE_TEST_DATABASE?: string;
}

const databaseTarget = (raw: string): string => {
  const url = new URL(raw);
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}/${url.pathname.replace(/^\//, "").toLowerCase()}`;
};

export function selectDatabaseUrl(environment: DatabaseEnvironment): string {
  const directUrl = environment.DATABASE_URL?.trim() || "";
  if (environment.NODE_ENV !== "test") return directUrl;

  const testUrl = environment.TEST_DATABASE_URL?.trim();
  if (!testUrl)
    throw new Error("TEST_DATABASE_URL is required when NODE_ENV=test.");
  const parsed = new URL(testUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol))
    throw new Error("TEST_DATABASE_URL must use PostgreSQL.");
  const target = databaseTarget(testUrl);
  for (const [name, candidate] of [
    ["DATABASE_URL", directUrl],
    ["PRODUCTION_DATABASE_URL", environment.PRODUCTION_DATABASE_URL || ""],
  ] as const) {
    if (candidate && databaseTarget(candidate) === target)
      throw new Error(`TEST_DATABASE_URL must not match ${name}.`);
  }

  const database = parsed.pathname.replace(/^\//, "");
  const allowlist = (environment.TEST_DATABASE_ALLOWLIST || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed =
    allowlist.includes(parsed.hostname) ||
    allowlist.includes(`${parsed.hostname}/${database}`) ||
    environment.ALLOW_DESTRUCTIVE_TEST_DATABASE === "yes";
  if (!allowed)
    throw new Error("TEST_DATABASE_URL is not allowlisted for automated tests.");
  return testUrl;
}

export function buildRuntimeDatabaseUrl(
  directUrl: string,
  options: RuntimeDatabaseUrlOptions = {},
): string | undefined {
  const selected = options.poolUrl?.trim() || directUrl.trim();
  if (!selected) return undefined;

  const url = new URL(selected);
  if (!options.poolUrl && options.useNeonPooler !== false)
    url.hostname = neonPoolerHostname(url.hostname);

  if (!url.searchParams.has("connection_limit"))
    url.searchParams.set("connection_limit", options.connectionLimit || "3");
  if (!url.searchParams.has("pool_timeout"))
    url.searchParams.set("pool_timeout", options.poolTimeout || "20");
  if (!url.searchParams.has("connect_timeout"))
    url.searchParams.set("connect_timeout", options.connectTimeout || "15");
  return url.toString();
}

export function databaseConnectionMode(urlValue: string | undefined): "pooled" | "direct" {
  if (!urlValue) return "direct";
  try {
    return /-pooler(?:\.|$)/i.test(new URL(urlValue).hostname) ? "pooled" : "direct";
  } catch {
    return "direct";
  }
}

function neonPoolerHostname(hostname: string): string {
  if (!hostname.endsWith(".neon.tech")) return hostname;
  const labels = hostname.split(".");
  if (!labels[0].startsWith("ep-") || labels[0].endsWith("-pooler")) return hostname;
  labels[0] = `${labels[0]}-pooler`;
  return labels.join(".");
}
