import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infrastructure/logging/logger";

describe("logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes structured info and warn events", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logger.info("import_started", { requestId: "request-1" });
    logger.warn("import_rejected");
    expect(JSON.parse(info.mock.calls[0][0])).toMatchObject({
      level: "info",
      event: "import_started",
      requestId: "request-1",
    });
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({
      level: "warn",
      event: "import_rejected",
    });
  });

  it("serializes Error details without the raw object", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    logger.error("import_failed", { error: new Error("failure") });
    expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
      level: "error",
      event: "import_failed",
      error: { message: "failure", stack: expect.any(String) },
    });
  });
  it("does not serialize non-Error values as error details", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    logger.error("import_failed", { error: "internal value" });
    expect(JSON.parse(error.mock.calls[0][0])).not.toHaveProperty("error");
  });
});
