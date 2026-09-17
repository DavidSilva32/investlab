import { z } from "zod";

type DatabaseEnvironment = {
  DATABASE_URL?: string;
  DATABASE_URL_POOLED?: string;
};

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

export function getDatabaseUrl(
  environment: DatabaseEnvironment = process.env as DatabaseEnvironment,
): string {
  return directDatabaseEnvironmentSchema.parse(environment).DATABASE_URL;
}

export function getDatabasePooledUrl(
  environment: DatabaseEnvironment = process.env as DatabaseEnvironment,
): string {
  return pooledDatabaseEnvironmentSchema.parse(environment).DATABASE_URL_POOLED;
}

export function getDatabaseEnvironment(
  environment: DatabaseEnvironment = process.env as DatabaseEnvironment,
) {
  return databaseEnvironmentSchema.parse(environment);
}
