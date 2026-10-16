import { authController } from "@/backend/controllers/auth.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const GET = withApiRequestLogging(
  "GET",
  "/api/admin/users",
  authController.adminData.bind(authController),
);
export const POST = withApiRequestLogging(
  "POST",
  "/api/admin/users",
  authController.createInvite.bind(authController),
);
