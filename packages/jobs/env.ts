import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "prod"]).default("development"),
    DATABASE_URL: z.string("database url"),
    // secrets inside job data (OTP codes) are encrypted with this; 64 hex characters = 32 bytes
    JOBS_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-f]{64}$/i, "JOBS_ENCRYPTION_KEY must be 64 hex characters")
      .optional(),
  })
  .refine((env) => env.NODE_ENV !== "prod" || env.JOBS_ENCRYPTION_KEY, {
    message: "JOBS_ENCRYPTION_KEY is required in prod",
  });

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) throw new Error(safeParseResult.error.message);
  return safeParseResult.data;
}

export const env = createEnv(process.env);
