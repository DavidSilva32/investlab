import { describe, expect, it } from "vitest";
import { getApiMessage } from "@/lib/api-message";

describe("getApiMessage", () => {
  it("returns a non-empty backend message", () => {
    expect(
      getApiMessage({ message: "  Conflito de posição.  " }, "Fallback"),
    ).toBe("Conflito de posição.");
  });

  it.each([
    null,
    undefined,
    "message",
    12,
    {},
    { message: null },
    { message: "  " },
  ])("uses the fallback for an invalid payload: %j", (payload) => {
    expect(getApiMessage(payload, "Falha operacional.")).toBe(
      "Falha operacional.",
    );
  });
});
