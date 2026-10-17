import { requireAuthenticatedUser } from "@/infrastructure/auth/authorization";
import { privacyCenterService } from "@/backend/services/privacy-center.service";
import { ApplicationError } from "@/backend/errors/application-error";

export class PrivacyCenterController {
  async getTermsAcceptances(request: Request) {
    try {
      const user = await requireAuthenticatedUser(request.headers);
      return Response.json(
        await privacyCenterService.getTermsAcceptances(user.id),
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof ApplicationError) {
        return Response.json(
          { message: error.message },
          {
            status: error.statusCode,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
      return Response.json(
        { message: "Não foi possível carregar seus registros de aceite." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
}

export const privacyCenterController = new PrivacyCenterController();
