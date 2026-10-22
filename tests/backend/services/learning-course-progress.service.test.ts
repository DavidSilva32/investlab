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
  beforeEach(() => {
    vi.clearAllMocks();
    repository.listForCurrentOwner.mockResolvedValue([]);
  });

  it("lists saved progress and omits missing rows", async () => {
    repository.listForCurrentOwner.mockResolvedValue([
      {
        courseId: "fiis",
        courseVersion: 2,
        completedLessonIds: ["lesson-1"],
        lastLessonId: "lesson-1",
        latestScore: 8,
        bestScore: 10,
        quizAttemptCount: 2,
        passedAt: new Date("2026-10-22T10:00:00.000Z"),
        updatedAt: new Date("2026-10-22T10:01:00.000Z"),
      },
      {
        courseId: "fixed_income",
        courseVersion: 2,
        completedLessonIds: [],
        lastLessonId: null,
        latestScore: null,
        bestScore: null,
        quizAttemptCount: 0,
        passedAt: null,
        updatedAt: new Date("2026-10-22T10:02:00.000Z"),
      },
    ]);

    await expect(service.listCurrentOwnerProgress()).resolves.toEqual({
      courses: [
        {
          courseId: "fiis",
          courseVersion: 2,
          hasCurrentVersionProgress: true,
          currentVersionPassed: true,
          completedLessonIds: ["lesson-1"],
          lastLessonId: "lesson-1",
          latestScore: 8,
          bestScore: 10,
          quizAttemptCount: 2,
          passed: true,
          passedAt: "2026-10-22T10:00:00.000Z",
          updatedAt: "2026-10-22T10:01:00.000Z",
        },
        {
          courseId: "fixed_income",
          courseVersion: 2,
          hasCurrentVersionProgress: true,
          currentVersionPassed: false,
          completedLessonIds: [],
          lastLessonId: null,
          latestScore: null,
          bestScore: null,
          quizAttemptCount: 0,
          passed: false,
          passedAt: null,
          updatedAt: "2026-10-22T10:02:00.000Z",
        },
      ],
    });
  });

  it("preserves a prior medal but starts updated lessons and exam without old results", async () => {
    repository.listForCurrentOwner.mockResolvedValue([
      {
        courseId: "fiis",
        courseVersion: 1,
        completedLessonIds: ["lesson-1", "lesson-2"],
        lastLessonId: "lesson-2",
        latestScore: 8,
        bestScore: 8,
        quizAttemptCount: 1,
        passedAt: new Date("2026-10-20T10:00:00.000Z"),
        updatedAt: new Date("2026-10-20T10:01:00.000Z"),
      },
    ]);

    await expect(service.listCurrentOwnerProgress()).resolves.toEqual({
      courses: [
        {
          courseId: "fiis",
          courseVersion: 2,
          hasCurrentVersionProgress: false,
          currentVersionPassed: false,
          completedLessonIds: [],
          lastLessonId: null,
          latestScore: null,
          bestScore: null,
          quizAttemptCount: 0,
          passed: true,
          passedAt: "2026-10-20T10:00:00.000Z",
          updatedAt: "2026-10-20T10:01:00.000Z",
        },
      ],
    });
  });

  it("uses only current-version lesson progress while retaining the old medal", async () => {
    repository.listForCurrentOwner.mockResolvedValue([
      {
        courseId: "fiis",
        courseVersion: 1,
        completedLessonIds: ["lesson-1", "lesson-2", "lesson-3", "lesson-4"],
        lastLessonId: "lesson-4",
        latestScore: 8,
        bestScore: 8,
        quizAttemptCount: 1,
        passedAt: new Date("2026-10-20T10:00:00.000Z"),
        updatedAt: new Date("2026-10-20T10:01:00.000Z"),
      },
      {
        courseId: "fiis",
        courseVersion: 2,
        completedLessonIds: ["lesson-1"],
        lastLessonId: "lesson-1",
        latestScore: null,
        bestScore: null,
        quizAttemptCount: 0,
        passedAt: null,
        updatedAt: new Date("2026-10-22T10:01:00.000Z"),
      },
    ]);

    const result = await service.listCurrentOwnerProgress();

    expect(result.courses[0]).toMatchObject({
      courseVersion: 2,
      hasCurrentVersionProgress: true,
      currentVersionPassed: false,
      completedLessonIds: ["lesson-1"],
      lastLessonId: "lesson-1",
      passed: true,
      latestScore: null,
      bestScore: null,
    });
  });

  it("returns an empty list when the repository has no course rows", async () => {
    repository.listForCurrentOwner.mockResolvedValue([]);
    await expect(service.listCurrentOwnerProgress()).resolves.toEqual({
      courses: [],
    });
  });

  it("computes score and passing result from server-owned answer keys", async () => {
    const questions = assetClassLearningContent.fiis.assessment;
    const answers = questions.map((question, index) =>
      index < 7
        ? question.correctOptionIndex
        : (question.correctOptionIndex + 1) % question.options.length,
    );
    repository.save.mockResolvedValue({
      progress: {
        courseId: "fiis",
        courseVersion: 2,
        completedLessonIds: ["lesson-1"],
        lastLessonId: "lesson-1",
        latestScore: 7,
        bestScore: 7,
        quizAttemptCount: 1,
        passedAt: new Date("2026-10-22T10:00:00.000Z"),
        updatedAt: new Date("2026-10-22T10:00:00.000Z"),
      },
      attempt: { score: 7, passed: true },
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
      expect.objectContaining({ latestScore: 7, passed: true }),
    );
    expect(result.assessment).toEqual({ score: 7, passed: true });
    expect(result.progress?.passed).toBe(true);
  });

  it("saves a lesson without a last lesson id or assessment", async () => {
    repository.save.mockResolvedValue({
      progress: {
        courseId: "fiis",
        courseVersion: 2,
        completedLessonIds: ["lesson-1"],
        lastLessonId: null,
        latestScore: null,
        bestScore: null,
        quizAttemptCount: 0,
        passedAt: null,
        updatedAt: new Date("2026-10-22T10:00:00.000Z"),
      },
      attempt: null,
    });

    const result = await service.saveCurrentOwnerProgress({
      courseId: "fiis",
      completedLessonIds: ["lesson-1"],
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lastLessonId: null,
        latestScore: null,
        attemptId: null,
        passed: false,
      }),
    );
    expect(result.progress?.passed).toBe(false);
    expect(result.assessment).toBeNull();
  });

  it("records a failing assessment score without marking the course passed", async () => {
    const questions = assetClassLearningContent.fiis.assessment;
    const answers = questions.map((question, index) =>
      index < 6
        ? question.correctOptionIndex
        : (question.correctOptionIndex + 1) % question.options.length,
    );
    repository.save.mockResolvedValue({
      progress: {
        courseId: "fiis",
        courseVersion: 2,
        completedLessonIds: [],
        lastLessonId: null,
        latestScore: 6,
        bestScore: 6,
        quizAttemptCount: 1,
        passedAt: null,
        updatedAt: new Date("2026-10-22T10:00:00.000Z"),
      },
      attempt: { score: 6, passed: false },
    });
    repository.listForCurrentOwner.mockResolvedValue([
      {
        courseId: "fiis",
        courseVersion: 2,
        completedLessonIds: [],
        lastLessonId: null,
        latestScore: 6,
        bestScore: 6,
        quizAttemptCount: 1,
        passedAt: null,
        updatedAt: new Date("2026-10-22T10:01:00.000Z"),
      },
      {
        courseId: "fiis",
        courseVersion: 1,
        completedLessonIds: ["lesson-1", "lesson-2", "lesson-3", "lesson-4"],
        lastLessonId: "lesson-4",
        latestScore: 8,
        bestScore: 8,
        quizAttemptCount: 1,
        passedAt: new Date("2026-10-20T10:00:00.000Z"),
        updatedAt: new Date("2026-10-20T10:01:00.000Z"),
      },
    ]);

    const result = await service.saveCurrentOwnerProgress({
      courseId: "fiis",
      assessment: {
        attemptId: "00000000-0000-4000-8000-000000000002",
        answers,
      },
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ latestScore: 6, passed: false }),
    );
    expect(result.assessment).toEqual({ score: 6, passed: false });
    expect(result.progress).toMatchObject({
      courseVersion: 2,
      latestScore: 6,
      bestScore: 6,
      passed: true,
      passedAt: "2026-10-20T10:00:00.000Z",
    });
  });

  it("rejects unknown lesson identifiers and incomplete assessments before persistence", async () => {
    await expect(
      service.saveCurrentOwnerProgress({ courseId: "unknown" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.saveCurrentOwnerProgress({
        courseId: "fiis",
        completedLessonIds: ["lesson-999"],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.saveCurrentOwnerProgress({
        courseId: "fiis",
        lastLessonId: "lesson-999",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.saveCurrentOwnerProgress({
        courseId: "fiis",
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
    await expect(
      service.saveCurrentOwnerProgress({
        courseId: "fiis",
        assessment: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          answers: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
