import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().optional(),
  NODE_ENV: z.enum(["development", "prod"]).default("development"),
  BASE_URL: z.string().default("http://localhost:8000"),
  PHONE_NUMBER: z.string("PHONE_NUMBER of the first admin"),
  // Express "trust proxy": which hops in front of the API may report the visitor's IP
  TRUST_PROXY: z.string().default("loopback"),
  // where uploaded photos are kept on disk until a CDN takes over
  UPLOADS_DIR: z.string().default("uploads"),
});

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) throw new Error(safeParseResult.error.message);
  return safeParseResult.data;
}

export const env = createEnv(process.env);
