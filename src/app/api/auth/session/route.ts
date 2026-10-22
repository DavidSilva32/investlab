import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const GET = withApiRequestLogging(
  "GET",
  "/api/auth/session",
  async (request: Request) => {
    const user = await getAuthenticatedUser(request.headers);
    if (!user) {
      return Response.json(
        { user: null },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          betaActivatedAt: user.betaActivatedAt ?? null,
          betaExpiresAt: user.betaExpiresAt ?? null,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);
