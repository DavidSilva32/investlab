import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const supportedEnvironments = new Set(["development", "preview", "production"]);

export function getVercelBuildSteps(environment, hasDatabaseUrl) {
  if (environment === undefined || environment === "") {
    return hasDatabaseUrl ? ["db:migrate", "build"] : ["build"];
  }

  if (!supportedEnvironments.has(environment)) {
    throw new Error("VERCEL_ENV must be development, preview, or production.");
  }

  if (environment === "production" && !hasDatabaseUrl) {
    throw new Error("DATABASE_URL is required for production migrations.");
  }

  if (environment !== "production" && hasDatabaseUrl) {
    throw new Error("DATABASE_URL must not be configured outside production.");
  }

  return environment === "production" ? ["db:migrate", "build"] : ["build"];
}

export function runVercelBuild(environment, hasDatabaseUrl, runScript) {
  const scripts = getVercelBuildSteps(environment, hasDatabaseUrl);
  for (const script of scripts) {
    const exitCode = runScript(script);
    if (exitCode !== 0) return exitCode ?? 1;
  }
  return 0;
}

function runPnpmScript(script) {
  const isWindows = process.platform === "win32";
  const result = spawnSync(isWindows ? "pnpm.cmd" : "pnpm", [script], {
    shell: isWindows,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Could not start pnpm ${script}.`);
    return 1;
  }
  return result.status ?? 1;
}

function main() {
  try {
    const exitCode = runVercelBuild(
      process.env.VERCEL_ENV,
      Boolean(process.env.DATABASE_URL),
      runPnpmScript,
    );
    process.exitCode = exitCode;
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Vercel build setup failed.",
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
