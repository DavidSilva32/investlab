import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listForCurrentOwner: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/backend/repositories/learning-course-progress.repository", () => ({
  learningCourseProgressRepository: repository,
}));

import { LearningCourseProgressService } from "@/backend/services/learning-course-progress.service";
import { assetClassLearningContent } from "@/lib/asset-class-learning";

const service = new LearningCourseProgressService();

describe("LearningCourseProgressService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes score and passing result from server-owned answer keys", async () => {
    const questions = assetClassLearningContent.fiis.assessment;
    const answers = questions.map((question, index) =>
      index < 4
        ? question.correctOptionIndex
        : (question.correctOptionIndex + 1) % question.options.length,
    );
    repository.save.mockResolvedValue({
      progress: {
        courseId: "fiis",
        courseVersion: 1,
        completedLessonIds: ["lesson-1"],
        lastLessonId: "lesson-1",
        latestScore: 8,
        bestScore: 8,
        quizAttemptCount: 1,
        passedAt: new Date("2026-10-22T10:00:00.000Z"),
        updatedAt: new Date("2026-10-22T10:00:00.000Z"),
      },
      attempt: { score: 8, passed: true },
    });

    const result = await service.saveCurrentOwnerProgress({
      courseId: "fiis",
      completedLessonIds: ["lesson-1"],
      lastLessonId: "lesson-1",
      assessment: {
        attemptId: "00000000-0000-4000-8000-000000000001",
        answers,
      },
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ latestScore: 8, passed: true }),
    );
    expect(result.assessment).toEqual({ score: 8, passed: true });
    expect(result.progress?.passed).toBe(true);
  });

  it("rejects unknown lesson identifiers and incomplete assessments before persistence", async () => {
    await expect(
      service.saveCurrentOwnerProgress({
        courseId: "fiis",
        completedLessonIds: ["lesson-999"],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.saveCurrentOwnerProgress({
        courseId: "fiis",
        assessment: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          answers: [0],
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
