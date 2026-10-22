import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
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

  it("lists progress for the current owner", async () => {
    const rows = [{ courseId: "fiis", userId: "owner-1" }];
    const where = vi.fn().mockResolvedValue(rows);
    database.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where }),
    });
    const repository = new LearningCourseProgressRepository();

    await expect(repository.listForCurrentOwner()).resolves.toEqual(rows);
    expect(database.select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
  });

  it("gets a course progress row by current owner, course and version", async () => {
    const row = { courseId: "fiis", userId: "owner-1", courseVersion: 1 };
    const limit = vi.fn().mockResolvedValue([row]);
    const where = vi.fn().mockReturnValue({ limit });
    database.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where }),
    });
    const repository = new LearningCourseProgressRepository();

    await expect(repository.getForCurrentOwner("fiis", 1)).resolves.toEqual(
      row,
    );
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("returns null when a course has no saved progress", async () => {
    database.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const repository = new LearningCourseProgressRepository();

    await expect(repository.getForCurrentOwner("fiis", 1)).resolves.toBeNull();
  });

  it("saves lesson progress without creating an assessment attempt", async () => {
    const insertedTables: unknown[] = [];
    const progress = {
      courseId: "fiis",
      courseVersion: 1,
      completedLessonIds: ["lesson-1"],
      lastLessonId: "lesson-1",
      latestScore: null,
      bestScore: null,
      quizAttemptCount: 0,
      passedAt: null,
      updatedAt: new Date("2026-10-22T10:00:00.000Z"),
    };
    const transaction = {
      insert: (table: unknown) => {
        insertedTables.push(table);
        return {
          values: () => ({
            onConflictDoUpdate: () => ({
              returning: async () => [progress],
            }),
          }),
        };
      },
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    const repository = new LearningCourseProgressRepository();

    await expect(
      repository.save({
        courseId: "fiis",
        courseVersion: 1,
        completedLessonIds: ["lesson-1"],
        lastLessonId: "lesson-1",
        latestScore: null,
        attemptId: null,
        passed: false,
      }),
    ).resolves.toEqual({ progress, attempt: null });
    expect(insertedTables).toEqual([learningCourseProgress]);
  });

  it("persists a final attempt once and keeps duplicate retries idempotent", async () => {
    const storedAttempts = new Map<
      string,
      { score: number; passed: boolean }
    >();
    const attemptInsertValues: Record<string, unknown>[] = [];
    const progressInsertValues: Record<string, unknown>[] = [];
    let progressRow: Record<string, unknown> | null = null;
    let hideStoredAttempt = false;
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
                ? hideStoredAttempt
                  ? []
                  : [...storedAttempts.values()].slice(0, 1)
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
    hideStoredAttempt = true;
    const duplicateWithoutStoredRow = await repository.save(input);
    hideStoredAttempt = false;
    const zeroScoreAttempt = await repository.save({
      ...input,
      latestScore: null,
      attemptId: "attempt-2",
      passed: false,
    });

    expect(first.attempt).toEqual({ score: 8, passed: true });
    expect(retry.attempt).toEqual({ score: 8, passed: true });
    expect(duplicateWithoutStoredRow.attempt).toBeNull();
    expect(zeroScoreAttempt.attempt).toEqual({ score: 0, passed: false });
    expect(attemptInsertValues).toHaveLength(4);
    expect(
      progressInsertValues.map(({ quizAttemptCount }) => quizAttemptCount),
    ).toEqual([1, 0, 0, 1]);
    expect(database.transaction).toHaveBeenCalledTimes(4);
    expect(learningCourseProgress).toBeDefined();
  });
});
