import { z } from "zod";

const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.url(
    "DATABASE_URL must be a valid PostgreSQL connection URL.",
  ),
});

export function getDatabaseUrl(environment = process.env): string {
  return databaseEnvironmentSchema.parse(environment).DATABASE_URL;
}
