import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/logout/route";
describe("logout route", () => {
  it("clears the session cookie", async () => {
    const response = await POST();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
