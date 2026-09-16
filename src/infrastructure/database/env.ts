import { z } from "zod";

const directDatabaseEnvironmentSchema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required." })
    .url({ error: "DATABASE_URL must be a valid PostgreSQL connection URL." }),
});

const pooledDatabaseEnvironmentSchema = z.object({
  DATABASE_URL_POOLED: z
    .string({ error: "DATABASE_URL_POOLED is required." })
    .url({
      error: "DATABASE_URL_POOLED must be a valid PostgreSQL connection URL.",
    }),
});

const databaseEnvironmentSchema = directDatabaseEnvironmentSchema.extend(
  pooledDatabaseEnvironmentSchema.shape,
);

export function getDatabaseUrl(environment = process.env): string {
  return directDatabaseEnvironmentSchema.parse(environment).DATABASE_URL;
}

export function getDatabasePooledUrl(environment = process.env): string {
  return pooledDatabaseEnvironmentSchema.parse(environment).DATABASE_URL_POOLED;
}

export function getDatabaseEnvironment(environment = process.env) {
  return databaseEnvironmentSchema.parse(environment);
}
