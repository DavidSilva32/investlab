import { billingController } from "@/backend/controllers/billing.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const GET = withApiRequestLogging("GET", "/api/billing", () =>
  billingController.get(),
);

export const POST = withApiRequestLogging(
  "POST",
  "/api/billing",
  (request: Request) => billingController.subscribe(request),
);

export const DELETE = withApiRequestLogging("DELETE", "/api/billing", () =>
  billingController.cancel(),
);
