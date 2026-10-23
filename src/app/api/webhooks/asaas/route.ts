import { billingController } from "@/backend/controllers/billing.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const POST = withApiRequestLogging(
  "POST",
  "/api/webhooks/asaas",
  (request: Request) => billingController.webhook(request),
);
