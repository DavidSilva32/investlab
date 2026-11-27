import { describe, expect, it } from "vitest";
import { getMcpLoginCallback } from "@/lib/mcp/oauth-login-callback";

describe("getMcpLoginCallback", () => {
  it("allows the internal MCP consent route and preserves its OAuth query", () => {
    const callback = "/mcp/consent?scope=mcp%3Aread&state=signed";

    expect(getMcpLoginCallback(callback)).toBe(callback);
  });

  it.each([
    "https://malicious.example/collect",
    "http://[",
    "//malicious.example/collect",
    "/dashboard?state=signed",
    "/mcp/consent",
    "/mcp/consent?scope=read#fragment",
    undefined,
    ["/mcp/consent?scope=mcp%3Aread"],
  ])("rejects unsafe or incomplete callback %s", (callback) => {
    expect(getMcpLoginCallback(callback)).toBeUndefined();
  });
});
