import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/auth/logout/route";

describe("logout route", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("clears a production session cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0; Secure");
  });

  it("clears a development session cookie without Secure", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await POST();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).not.toContain("; Secure");
  });
});
