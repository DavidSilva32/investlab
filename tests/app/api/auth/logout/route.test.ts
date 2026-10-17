import { describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/auth/auth", () => ({ auth: { api: { signOut } } }));

import { POST } from "@/app/api/auth/logout/route";

describe("logout route", () => {
  it("revokes the persisted server session and clears the Better Auth cookie", async () => {
    signOut.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Set-Cookie":
            "better-auth.session_token=; Max-Age=0; HttpOnly; SameSite=Lax",
        },
      }),
    );
    const response = await POST(
      new Request("http://investlab.test/api/auth/logout", {
        method: "POST",
        headers: {
          cookie:
            "better-auth.session_token=abc; investlab-support-view=signed-token",
        },
      }),
    );
    expect(signOut).toHaveBeenCalledWith(
      expect.objectContaining({ asResponse: true }),
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain(
      "investlab-support-view=",
    );
  });

  it("clears the support cookie even when Better Auth logout fails", async () => {
    signOut.mockRejectedValueOnce(new Error("private failure"));
    const response = await POST(
      new Request("http://investlab.test/api/auth/logout", {
        method: "POST",
        headers: { cookie: "investlab-support-view=signed-token" },
      }),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("set-cookie")).toContain(
      "investlab-support-view=",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
