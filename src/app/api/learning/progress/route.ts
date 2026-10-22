import { learningCourseProgressController } from "@/backend/controllers/learning-course-progress.controller";
import { withApiRequestLogging } from "@/infrastructure/logging/api-request";

export const GET = withApiRequestLogging("GET", "/api/learning/progress", () =>
  learningCourseProgressController.list(),
);

export const PUT = withApiRequestLogging(
  "PUT",
  "/api/learning/progress",
  (request: Request) => learningCourseProgressController.save(request),
);
