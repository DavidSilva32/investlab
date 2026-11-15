import { describe, expect, it } from "vitest";
import { GET } from "@/app/(public)/docs/api/route";

describe("GET /docs/api", () => {
  it("renders Scalar configured to load the local OpenAPI contract", async () => {
    const response = await GET();
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("/api/openapi.json");
    expect(html).toContain("api-reference@1.76.4");
  });
});
