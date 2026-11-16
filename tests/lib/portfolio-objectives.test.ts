import { describe, expect, it } from "vitest";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

describe("reserve objective identifier", () => {
  it("uses its stable identifier", () => {
    expect(reserveObjectiveId).toBe("00000000-0000-4000-8000-000000000010");
  });
});
