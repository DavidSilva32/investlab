import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));
vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  requireDataOwnerId: () => "owner-1",
}));

import { LearningCourseProgressRepository } from "@/backend/repositories/learning-course-progress.repository";
import {
  learningCourseAttempts,
  learningCourseProgress,
} from "@/infrastructure/database/schema";

describe("LearningCourseProgressRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists a final attempt once and keeps duplicate retries idempotent", async () => {
    const storedAttempts = new Map<
      string,
      { score: number; passed: boolean }
    >();
    const attemptInsertValues: Record<string, unknown>[] = [];
    const progressInsertValues: Record<string, unknown>[] = [];
    let progressRow: Record<string, unknown> | null = null;
    const transaction = {
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              if (table === learningCourseAttempts) {
                attemptInsertValues.push(values);
                const attemptId = String(values.attemptId);
                if (storedAttempts.has(attemptId)) return [];
                const row = {
                  score: Number(values.score),
                  passed: Boolean(values.passed),
                };
                storedAttempts.set(attemptId, row);
                return [row];
              }
              return [];
            },
          }),
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => ({
            returning: async () => {
              progressInsertValues.push(values);
              progressRow = {
                ...progressRow,
                ...values,
                lastLessonId: "lesson-2",
                quizAttemptCount: Number(values.quizAttemptCount),
                latestScore:
                  values.latestScore ?? progressRow?.latestScore ?? null,
                bestScore: values.bestScore ?? progressRow?.bestScore ?? null,
                passedAt: values.passedAt ?? progressRow?.passedAt ?? null,
                updatedAt: values.updatedAt,
              };
              expect(set.quizAttemptCount).toBeDefined();
              return [progressRow];
            },
          }),
        }),
      }),
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () =>
              table === learningCourseAttempts
                ? [...storedAttempts.values()].slice(0, 1)
                : progressRow
                  ? [progressRow]
                  : [],
          }),
        }),
      }),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    const repository = new LearningCourseProgressRepository();
    const input = {
      courseId: "fiis",
      courseVersion: 1,
      completedLessonIds: ["lesson-1", "lesson-2"],
      lastLessonId: "lesson-2",
      latestScore: 8,
      attemptId: "attempt-1",
      passed: true,
    };

    const first = await repository.save(input);
    const retry = await repository.save(input);

    expect(first.attempt).toEqual({ score: 8, passed: true });
    expect(retry.attempt).toEqual({ score: 8, passed: true });
    expect(attemptInsertValues).toHaveLength(2);
    expect(
      progressInsertValues.map(({ quizAttemptCount }) => quizAttemptCount),
    ).toEqual([1, 0]);
    expect(database.transaction).toHaveBeenCalledTimes(2);
    expect(learningCourseProgress).toBeDefined();
  });
});
