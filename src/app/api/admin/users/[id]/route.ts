import { authController } from "@/backend/controllers/auth.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const PATCH = withApiRequestLogging(
  "PATCH",
  "/api/admin/users/[id]",
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    return authController.updateUser(request, id);
  },
);
export const DELETE = withApiRequestLogging(
  "DELETE",
  "/api/admin/users/[id]",
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    return authController.deleteUser(request, id);
  },
);
