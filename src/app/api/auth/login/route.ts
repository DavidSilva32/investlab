import { authController } from "@/backend/controllers/auth.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const runtime = "nodejs";
export const POST = withApiRequestLogging(
  "POST",
  "/api/auth/login",
  authController.login.bind(authController),
);
