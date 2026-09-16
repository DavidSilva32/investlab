import { describe, expect, it } from "vitest";

import { application } from "@/lib/application";

describe("application", () => {
  it("exposes the application identity used by the UI", () => {
    expect(application).toMatchObject({
      name: "InvestLab",
      description: expect.any(String),
    });
  });
});
