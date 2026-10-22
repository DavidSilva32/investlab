import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { learningCourseProgressService } from "@/backend/services/learning-course-progress.service";

const saveProgressSchema = z
  .object({
    courseId: z.enum([
      "fixed_income",
      "brazilian_equities",
      "international_etfs",
      "fiis",
    ]),
    completedLessonIds: z.array(z.string().min(1).max(64)).max(16).optional(),
    lastLessonId: z.string().min(1).max(64).nullable().optional(),
    assessment: z
      .object({
        attemptId: z.uuid(),
        answers: z.array(z.number().int().min(0).max(16)).max(32),
      })
      .strict()
      .optional(),
  })
  .strict();

async function requestBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function errorResponse(error: unknown) {
  if (error instanceof ApplicationError) {
    return Response.json(
      { message: error.message },
      { status: error.statusCode, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { message: "Não foi possível salvar seu progresso de aprendizagem." },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export class LearningCourseProgressController {
  async list() {
    try {
      const response = Response.json(
        await learningCourseProgressService.listCurrentOwnerProgress(),
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  }

  async save(request: Request) {
    try {
      const parsed = saveProgressSchema.safeParse(await requestBody(request));
      if (!parsed.success) {
        return Response.json(
          { message: "Confira os dados do progresso e tente novamente." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      const response = Response.json(
        await learningCourseProgressService.saveCurrentOwnerProgress(
          parsed.data,
        ),
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  }
}

export const learningCourseProgressController =
  new LearningCourseProgressController();
