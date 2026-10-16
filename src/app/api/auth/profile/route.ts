import { authController } from "@/backend/controllers/auth.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const PATCH = withApiRequestLogging(
  "PATCH",
  "/api/auth/profile",
  (request: Request) => authController.updateOwnProfile(request),
);
