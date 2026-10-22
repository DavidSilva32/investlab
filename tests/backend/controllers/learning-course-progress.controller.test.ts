import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  listCurrentOwnerProgress: vi.fn(),
  saveCurrentOwnerProgress: vi.fn(),
}));

vi.mock("@/backend/services/learning-course-progress.service", () => ({
  learningCourseProgressService: service,
}));

import { LearningCourseProgressController } from "@/backend/controllers/learning-course-progress.controller";
import { ApplicationError } from "@/backend/errors/application-error";

const controller = new LearningCourseProgressController();
const put = (body: unknown) =>
  new Request("https://test/api/learning/progress", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("LearningCourseProgressController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns private no-store progress", async () => {
    service.listCurrentOwnerProgress.mockResolvedValue({ courses: [] });
    const response = await controller.list();
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ courses: [] });
  });

  it("returns a safe error when listing progress fails", async () => {
    service.listCurrentOwnerProgress.mockRejectedValue(
      new ApplicationError("Faça login novamente.", 401),
    );
    const response = await controller.list();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      message: "Faça login novamente.",
    });
  });

  it("hides unexpected errors while listing and saving progress", async () => {
    service.listCurrentOwnerProgress.mockRejectedValue(
      new Error("database-secret"),
    );
    const listResponse = await controller.list();
    expect(listResponse.status).toBe(500);
    await expect(listResponse.json()).resolves.toEqual({
      message: "Não foi possível salvar seu progresso de aprendizagem.",
    });

    service.saveCurrentOwnerProgress.mockRejectedValue(
      new ApplicationError("Curso não encontrado.", 404),
    );
    const saveResponse = await controller.save(put({ courseId: "fiis" }));
    expect(saveResponse.status).toBe(404);
    expect(saveResponse.headers.get("cache-control")).toBe("no-store");
    await expect(saveResponse.json()).resolves.toEqual({
      message: "Curso não encontrado.",
    });

    service.saveCurrentOwnerProgress.mockRejectedValue(
      new Error("database-secret"),
    );
    const failedSave = await controller.save(put({ courseId: "fiis" }));
    expect(failedSave.status).toBe(500);
    expect(failedSave.headers.get("cache-control")).toBe("no-store");
    await expect(failedSave.json()).resolves.toEqual({
      message: "Não foi possível salvar seu progresso de aprendizagem.",
    });
  });

  it("treats malformed JSON as invalid progress input", async () => {
    const response = await controller.save(
      new Request("https://test/api/learning/progress", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{broken",
      }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(service.saveCurrentOwnerProgress).not.toHaveBeenCalled();
  });

  it("rejects client supplied scores, pass flags, or owner identifiers", async () => {
    const response = await controller.save(
      put({
        courseId: "fiis",
        userId: "another-user",
        score: 10,
        passed: true,
      }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(service.saveCurrentOwnerProgress).not.toHaveBeenCalled();
  });

  it("accepts only course progress and raw answers for server scoring", async () => {
    service.saveCurrentOwnerProgress.mockResolvedValue({
      progress: null,
      assessment: { score: 8, passed: true },
    });
    const input = {
      courseId: "fiis",
      completedLessonIds: ["lesson-1"],
      lastLessonId: "lesson-1",
      assessment: {
        attemptId: "00000000-0000-4000-8000-000000000001",
        answers: [0, 1, 2, 3, 0],
      },
    };
    const response = await controller.save(put(input));
    expect(response.status).toBe(200);
    expect(service.saveCurrentOwnerProgress).toHaveBeenCalledWith(input);
  });
});
