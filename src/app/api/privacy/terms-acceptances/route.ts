import { privacyCenterController } from "@/backend/controllers/privacy-center.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const GET = withApiRequestLogging(
  "GET",
  "/api/privacy/terms-acceptances",
  (request: Request) => privacyCenterController.getTermsAcceptances(request),
);

export const POST = withApiRequestLogging(
  "POST",
  "/api/privacy/terms-acceptances",
  (request: Request) => privacyCenterController.acceptCurrentTerms(request),
);
