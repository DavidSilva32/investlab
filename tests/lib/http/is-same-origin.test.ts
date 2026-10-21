import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/http/is-same-origin";

describe("isSameOrigin", () => {
  it("accepts a matching origin and rejects a different or missing origin", () => {
    expect(
      isSameOrigin(
        new Request("https://investlab.example/api/action", {
          headers: { origin: "https://investlab.example" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        new Request("https://investlab.example/api/action", {
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOrigin(new Request("https://investlab.example/api/action")),
    ).toBe(false);
  });

  it("rejects malformed origins", () => {
    expect(
      isSameOrigin(
        new Request("https://investlab.example/api/action", {
          headers: { origin: "not a url" },
        }),
      ),
    ).toBe(false);
  });
});
