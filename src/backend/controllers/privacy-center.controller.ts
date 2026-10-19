import { z } from "zod";
import { requireAuthenticatedUser } from "@/infrastructure/auth/authorization";
import { privacyCenterService } from "@/backend/services/privacy-center.service";
import { ApplicationError } from "@/backend/errors/application-error";

const acceptTermsSchema = z
  .object({ termsVersion: z.string().min(1).max(40) })
  .strict();

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

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

  async acceptCurrentTerms(request: Request) {
    try {
      const user = await requireAuthenticatedUser(request.headers);
      const body = acceptTermsSchema.safeParse(await jsonBody(request));
      if (!body.success) {
        return Response.json(
          { message: "Leia e aceite a versão vigente dos Termos de Uso." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      const result = await privacyCenterService.acceptCurrentTerms(
        user.id,
        body.data.termsVersion,
      );
      return Response.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
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
        { message: "Não foi possível registrar o aceite dos Termos de Uso." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
}

export const privacyCenterController = new PrivacyCenterController();
