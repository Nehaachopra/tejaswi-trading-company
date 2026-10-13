
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string("database url")
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "postgres:" || protocol === "postgresql:";
    }, "DATABASE_URL must be a valid PostgreSQL connection URL"),
});

export const env = envSchema.parse(process.env);
