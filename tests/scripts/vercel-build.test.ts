import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const buildScriptPath = path.resolve("scripts/vercel-build.mjs");

function runBuildProcess(options: {
  environment?: string;
  databaseUrl?: string;
  migrationExitCode?: string;
}) {
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "investlab-vercel-build-"),
  );
  const logPath = path.join(temporaryDirectory, "commands.log");
  const isWindows = process.platform === "win32";
  const commandName = isWindows ? "pnpm.cmd" : "pnpm";
  const commandPath = path.join(temporaryDirectory, commandName);
  const commandScript = isWindows
    ? [
        "@echo off",
        'echo %*>>"%VERCEL_BUILD_LOG%"',
        'if "%~1"=="db:migrate" exit /b %MIGRATION_EXIT_CODE%',
        'if "%~1"=="build" exit /b 0',
        "exit /b 1",
      ].join("\r\n")
    : [
        "#!/bin/sh",
        'printf "%s\\n" "$*" >> "$VERCEL_BUILD_LOG"',
        'if [ "$1" = "db:migrate" ]; then exit "${MIGRATION_EXIT_CODE:-0}"; fi',
        'if [ "$1" = "build" ]; then exit 0; fi',
        "exit 1",
      ].join("\n");

  try {
    writeFileSync(commandPath, commandScript, "utf8");
    if (!isWindows) chmodSync(commandPath, 0o755);
    const result = spawnSync(process.execPath, [buildScriptPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${temporaryDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
        VERCEL_ENV: options.environment,
        DATABASE_URL: options.databaseUrl,
        VERCEL_BUILD_LOG: logPath,
        MIGRATION_EXIT_CODE: options.migrationExitCode,
      },
    });

    return {
      status: result.status,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
      commands: existsSync(logPath)
        ? readFileSync(logPath, "utf8").trim().split(/\r?\n/).filter(Boolean)
        : [],
    };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

describe("Vercel production build migration step", () => {
  it("runs migrations before the build only in production", () => {
    const production = runBuildProcess({
      environment: "production",
      databaseUrl: "postgres://configured",
    });
    const preview = runBuildProcess({ environment: "preview" });
    const development = runBuildProcess({ environment: "development" });

    expect(production.status).toBe(0);
    expect(production.commands).toEqual(["db:migrate", "build"]);
    expect(preview.status).toBe(0);
    expect(preview.commands).toEqual(["build"]);
    expect(development.status).toBe(0);
    expect(development.commands).toEqual(["build"]);
  });

  it("does not build when the production migration fails", () => {
    const result = runBuildProcess({
      environment: "production",
      databaseUrl: "postgres://configured",
      migrationExitCode: "7",
    });

    expect(result.status).toBe(7);
    expect(result.commands).toEqual(["db:migrate"]);
  });

  it("uses DATABASE_URL as a production signal only when VERCEL_ENV is absent", () => {
    const productionFallback = runBuildProcess({
      databaseUrl: "postgres://configured",
    });
    const previewFallback = runBuildProcess({});

    expect(productionFallback.status).toBe(0);
    expect(productionFallback.commands).toEqual(["db:migrate", "build"]);
    expect(previewFallback.status).toBe(0);
    expect(previewFallback.commands).toEqual(["build"]);
  });

  it("rejects direct DATABASE_URL in explicit preview or development", () => {
    const preview = runBuildProcess({
      environment: "preview",
      databaseUrl: "postgres://unexpected",
    });
    const development = runBuildProcess({
      environment: "development",
      databaseUrl: "postgres://unexpected",
    });

    expect(preview.status).toBe(1);
    expect(preview.commands).toEqual([]);
    expect(development.status).toBe(1);
    expect(development.commands).toEqual([]);
  });

  it("fails closed when the environment is unknown", () => {
    const unknown = runBuildProcess({ environment: "staging" });

    expect(unknown.status).toBe(1);
    expect(unknown.commands).toEqual([]);
  });

  it("requires DATABASE_URL for a production migration", () => {
    const result = runBuildProcess({ environment: "production" });

    expect(result.status).toBe(1);
    expect(result.commands).toEqual([]);
    expect(result.output).toContain("DATABASE_URL is required");
    expect(result.output).not.toContain("postgres://");
  });

  it("is configured as the Vercel build command", () => {
    const configuration = JSON.parse(
      readFileSync(path.resolve("vercel.json"), "utf8"),
    ) as { buildCommand?: string };

    expect(configuration.buildCommand).toBe("node scripts/vercel-build.mjs");
  });
});
