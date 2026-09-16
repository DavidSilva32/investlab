import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL_POOLED;

if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
  throw new Error(
    "DATABASE_URL_POOLED is required to verify the database connection.",
  );
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query("SELECT 1");
  console.info("Database connection verified.");
} catch {
  console.error("Database connection verification failed.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
