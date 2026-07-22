export interface RuntimeDatabaseUrlOptions {
  poolUrl?: string;
  useNeonPooler?: boolean;
  connectionLimit?: string;
  poolTimeout?: string;
  connectTimeout?: string;
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
