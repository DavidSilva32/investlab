import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/openapi.json/route";

describe("GET /api/openapi.json", () => {
  it("serves the versioned API contract as public JSON", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(await response.json()).toMatchObject({
      openapi: "3.0.3",
      info: { title: "InvestLab API" },
    });
  });
});
