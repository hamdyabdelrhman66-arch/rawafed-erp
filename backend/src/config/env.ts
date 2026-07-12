import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  JWT_SECRET: z.string().min(32),
  REFRESH_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4300),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const env = schema.parse(process.env);
export type Environment = z.infer<typeof schema>;
