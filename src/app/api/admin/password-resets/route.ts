import { authController } from "@/backend/controllers/auth.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const POST = withApiRequestLogging(
  "POST",
  "/api/admin/password-resets",
  authController.createPasswordReset.bind(authController),
);
