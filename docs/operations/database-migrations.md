# Database migrations

InvestLab keeps Drizzle SQL migrations in `src/infrastructure/database/migrations`.
Runtime queries use `DATABASE_URL_POOLED`; Drizzle migrations use the direct
`DATABASE_URL` connection.

## Production deployment

Vercel runs `scripts/vercel-build.mjs` as its build command. For a production
deployment, the script runs `pnpm db:migrate` before `pnpm build`. Preview
deployments run the build without connecting to the production database. If
Vercel does not expose `VERCEL_ENV`, the presence of `DATABASE_URL` identifies
the production build; without it, the script runs build-only. Unknown explicit
environment values and a direct `DATABASE_URL` in Preview or Development stop
the build. A missing production `DATABASE_URL` or failed migration also stops
deployment.

Configure `DATABASE_URL` only for Vercel's Production environment, using the
direct database connection. Preview deployments should not have `DATABASE_URL`;
they may still use `DATABASE_URL_POOLED` for runtime if required. Keep
`DATABASE_URL_POOLED` for application runtime and `DATABASE_URL` for migrations.
Never place real connection values in the repository or logs.

## Schema change safety

Production migrations run while the previous deployment may still be serving
requests. Add schema changes in backward-compatible steps: expand the schema,
deploy code that uses it, then remove obsolete schema in a later deployment.
Do not combine a destructive schema change with code that requires the new
schema in the same release.

For local development, use `pnpm db:generate` to create a migration and run
`pnpm db:migrate` only against the database configured for that local task.
