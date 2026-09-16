import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseUrl } from "./env";

export function createDatabaseClient(databaseUrl = getDatabaseUrl()) {
  const pool = new Pool({ connectionString: databaseUrl });

  return drizzle({ client: pool });
}
