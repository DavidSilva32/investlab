import { authController } from "@/backend/controllers/auth.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const POST = withApiRequestLogging(
  "POST",
  "/api/auth/profile/password",
  (request: Request) => authController.changeOwnPassword(request),
);
