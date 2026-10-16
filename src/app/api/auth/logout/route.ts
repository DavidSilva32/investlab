import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const POST = withApiRequestLogging(
  "POST",
  "/api/auth/logout",
  async (request: Request) => {
    const { auth } = await import("@/infrastructure/auth/auth");
    return auth.api.signOut({ headers: request.headers, asResponse: true });
  },
);
