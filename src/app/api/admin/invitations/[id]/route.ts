import { authController } from "@/backend/controllers/auth.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const DELETE = withApiRequestLogging(
  "DELETE",
  "/api/admin/invitations/[id]",
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    return authController.revokeInvite(request, id);
  },
);
