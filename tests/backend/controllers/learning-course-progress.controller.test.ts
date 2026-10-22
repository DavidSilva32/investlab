import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  listCurrentOwnerProgress: vi.fn(),
  saveCurrentOwnerProgress: vi.fn(),
}));

vi.mock("@/backend/services/learning-course-progress.service", () => ({
  learningCourseProgressService: service,
}));

import { LearningCourseProgressController } from "@/backend/controllers/learning-course-progress.controller";

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
