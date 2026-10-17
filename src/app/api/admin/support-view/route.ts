import { adminSupportViewController } from "@/backend/controllers/admin-support-view.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const GET = withApiRequestLogging(
  "GET",
  "/api/admin/support-view",
  adminSupportViewController.get.bind(adminSupportViewController),
);

export const POST = withApiRequestLogging(
  "POST",
  "/api/admin/support-view",
  adminSupportViewController.start.bind(adminSupportViewController),
);

export const DELETE = withApiRequestLogging(
  "DELETE",
  "/api/admin/support-view",
  adminSupportViewController.end.bind(adminSupportViewController),
);
