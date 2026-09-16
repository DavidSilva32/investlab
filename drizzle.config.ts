import { defineConfig } from "drizzle-kit";

import { getDatabaseUrl } from "./src/infrastructure/database/env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/database/schema.ts",
  out: "./src/infrastructure/database/migrations",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
