import "dotenv/config";

if (process.env.NODE_ENV !== "test")
  throw new Error(
    "Refusing destructive database command: NODE_ENV must equal test.",
  );
const raw = process.env.TEST_DATABASE_URL;
if (!raw)
  throw new Error(
    "Refusing destructive database command: TEST_DATABASE_URL is missing.",
  );
const url = new URL(raw);
if (!["postgres:", "postgresql:"].includes(url.protocol))
  throw new Error(
    "Refusing destructive database command: test URL is not PostgreSQL.",
  );
const database = url.pathname.replace(/^\//, "");
const configured = (process.env.TEST_DATABASE_ALLOWLIST || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const allowlisted =
  configured.includes(url.hostname) ||
  configured.includes(`${url.hostname}/${database}`);
const explicitlyConfirmed =
  process.env.ALLOW_DESTRUCTIVE_TEST_DATABASE === "yes";
if (!allowlisted && !explicitlyConfirmed)
  throw new Error(
    "Refusing destructive database command: host/database is not allowlisted and explicit confirmation is absent.",
  );
if (
  process.env.DATABASE_URL &&
  process.env.PRODUCTION_DATABASE_URL &&
  process.env.TEST_DATABASE_URL === process.env.PRODUCTION_DATABASE_URL
)
  throw new Error(
    "Refusing destructive database command: test and production URLs match.",
  );
process.stdout.write("Test database guard passed.\n");
