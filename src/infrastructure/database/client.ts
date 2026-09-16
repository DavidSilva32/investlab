import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabasePooledUrl } from "./env";

const globalForDatabase = globalThis as typeof globalThis & {
  investLabDatabaseClient?: ReturnType<typeof drizzle>;
  investLabDatabasePool?: Pool;
};

function getDatabasePool(): Pool {
  if (!globalForDatabase.investLabDatabasePool) {
    globalForDatabase.investLabDatabasePool = new Pool({
      connectionString: getDatabasePooledUrl(),
    });
  }

  return globalForDatabase.investLabDatabasePool;
}

export function getDatabaseClient() {
  if (!globalForDatabase.investLabDatabaseClient) {
    globalForDatabase.investLabDatabaseClient = drizzle({
      client: getDatabasePool(),
    });
  }

  return globalForDatabase.investLabDatabaseClient;
}
