import { and, eq, sql } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  learningCourseAttempts,
  learningCourseProgress,
} from "@/infrastructure/database/schema";

export class LearningCourseProgressRepository {
  async listForCurrentOwner() {
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .select()
      .from(learningCourseProgress)
      .where(eq(learningCourseProgress.userId, userId));
  }

  async save(input: {
    courseId: string;
    courseVersion: number;
    completedLessonIds: string[];
    lastLessonId: string | null;
    latestScore: number | null;
    attemptId: string | null;
    passed: boolean;
  }) {
    const userId = requireDataOwnerId();
    const now = new Date();
    return getDatabaseClient().transaction(async (transaction) => {
      const [attempt] = input.attemptId
        ? await transaction
            .insert(learningCourseAttempts)
            .values({
              userId,
              courseId: input.courseId,
              courseVersion: input.courseVersion,
              attemptId: input.attemptId,
              score: input.latestScore ?? 0,
              passed: input.passed,
              createdAt: now,
            })
            .onConflictDoNothing()
            .returning({
              score: learningCourseAttempts.score,
              passed: learningCourseAttempts.passed,
            })
        : [];
      const isNewAttempt = Boolean(attempt);
      const persistedAttempt =
        input.attemptId && !attempt
          ? ((
              await transaction
                .select({
                  score: learningCourseAttempts.score,
                  passed: learningCourseAttempts.passed,
                })
                .from(learningCourseAttempts)
                .where(
                  and(
                    eq(learningCourseAttempts.userId, userId),
                    eq(learningCourseAttempts.courseId, input.courseId),
                    eq(
                      learningCourseAttempts.courseVersion,
                      input.courseVersion,
                    ),
                    eq(learningCourseAttempts.attemptId, input.attemptId),
                  ),
                )
                .limit(1)
            )[0] ?? null)
          : (attempt ?? null);
      const score = isNewAttempt ? input.latestScore : null;
      const attemptId = isNewAttempt ? input.attemptId : null;
      const [existingProgress] = await transaction
        .select({ id: learningCourseProgress.id })
        .from(learningCourseProgress)
        .where(
          and(
            eq(learningCourseProgress.userId, userId),
            eq(learningCourseProgress.courseId, input.courseId),
            eq(learningCourseProgress.courseVersion, input.courseVersion),
          ),
        )
        .limit(1);
      const reconciledLegacyAttempt =
        !existingProgress && !isNewAttempt ? persistedAttempt : null;
      const progressScore = score ?? reconciledLegacyAttempt?.score ?? null;
      const progressPassed = isNewAttempt
        ? input.passed
        : (reconciledLegacyAttempt?.passed ?? false);
      const [progress] = await transaction
        .insert(learningCourseProgress)
        .values({
          userId,
          courseId: input.courseId,
          courseVersion: input.courseVersion,
          completedLessonIds: input.completedLessonIds,
          lastLessonId: input.lastLessonId,
          latestScore: progressScore,
          bestScore: progressScore,
          quizAttemptCount: isNewAttempt || reconciledLegacyAttempt ? 1 : 0,
          lastAttemptId: attemptId,
          passedAt: progressPassed ? now : null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            learningCourseProgress.userId,
            learningCourseProgress.courseId,
            learningCourseProgress.courseVersion,
          ],
          set: {
            completedLessonIds: sql`coalesce((select jsonb_agg(distinct completed.value) from jsonb_array_elements(${learningCourseProgress.completedLessonIds} || excluded."completedLessonIds") as completed(value)), '[]'::jsonb)`,
            lastLessonId: sql`case
              when excluded."lastLessonId" is null then ${learningCourseProgress.lastLessonId}
              when ${learningCourseProgress.lastLessonId} is null then excluded."lastLessonId"
              when substring(excluded."lastLessonId" from '[0-9]+')::integer >= substring(${learningCourseProgress.lastLessonId} from '[0-9]+')::integer then excluded."lastLessonId"
              else ${learningCourseProgress.lastLessonId}
            end`,
            latestScore: sql`coalesce(excluded."latestScore", ${learningCourseProgress.latestScore})`,
            bestScore: sql`case when excluded."bestScore" is null then ${learningCourseProgress.bestScore} when ${learningCourseProgress.bestScore} is null then excluded."bestScore" else greatest(${learningCourseProgress.bestScore}, excluded."bestScore") end`,
            quizAttemptCount: sql`${learningCourseProgress.quizAttemptCount} + excluded."quizAttemptCount"`,
            lastAttemptId: sql`coalesce(excluded."lastAttemptId", ${learningCourseProgress.lastAttemptId})`,
            passedAt: sql`coalesce(${learningCourseProgress.passedAt}, excluded."passedAt")`,
            updatedAt: now,
          },
        })
        .returning();
      return { progress, attempt: persistedAttempt };
    });
  }

  async getForCurrentOwner(courseId: string, courseVersion: number) {
    const userId = requireDataOwnerId();
    const [progress] = await getDatabaseClient()
      .select()
      .from(learningCourseProgress)
      .where(
        and(
          eq(learningCourseProgress.userId, userId),
          eq(learningCourseProgress.courseId, courseId),
          eq(learningCourseProgress.courseVersion, courseVersion),
        ),
      )
      .limit(1);
    return progress ?? null;
  }
}

export const learningCourseProgressRepository =
  new LearningCourseProgressRepository();
