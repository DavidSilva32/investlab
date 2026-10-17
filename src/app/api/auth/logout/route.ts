import { withApiRequestLogging } from "@/infrastructure/logging/api-request";
import { authController } from "@/backend/controllers/auth.controller";

export const POST = withApiRequestLogging(
  "POST",
  "/api/auth/logout",
  async (request: Request) => {
    const { auth } = await import("@/infrastructure/auth/auth");
    let response: Response;
    try {
      response = await auth.api.signOut({
        headers: request.headers,
        asResponse: true,
      });
    } catch {
      response = Response.json(
        { message: "Não foi possível encerrar a sessão." },
        { status: 500 },
      );
    }
    return authController.logout(request, response);
  },
);
