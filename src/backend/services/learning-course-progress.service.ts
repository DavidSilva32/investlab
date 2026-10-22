import { ApplicationError } from "@/backend/errors/application-error";
import { learningCourseProgressRepository } from "@/backend/repositories/learning-course-progress.repository";
import {
  assetClassLearningContent,
  assetClassLearningCourseVersion,
  calculateLearningAssessmentScore,
  learningAssessmentPassScore,
} from "@/lib/asset-class-learning";
import type { StrategyAssetClassId } from "@/lib/strategy-allocation";

function getCourse(courseId: string) {
  const course = assetClassLearningContent[courseId as StrategyAssetClassId];
  if (!course) throw new ApplicationError("Curso não encontrado.", 404);
  return course;
}

function toProgressDto(
  row: Awaited<
    ReturnType<typeof learningCourseProgressRepository.getForCurrentOwner>
  >,
) {
  if (!row) return null;
  return {
    courseId: row.courseId,
    courseVersion: row.courseVersion,
    completedLessonIds: row.completedLessonIds,
    lastLessonId: row.lastLessonId,
    latestScore: row.latestScore,
    bestScore: row.bestScore,
    quizAttemptCount: row.quizAttemptCount,
    passed: row.passedAt !== null,
    passedAt: row.passedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class LearningCourseProgressService {
  async listCurrentOwnerProgress() {
    const rows = await learningCourseProgressRepository.listForCurrentOwner();
    return {
      courses: rows.map((row) => toProgressDto(row)).filter(Boolean),
    };
  }

  async saveCurrentOwnerProgress(input: {
    courseId: string;
    completedLessonIds?: string[];
    lastLessonId?: string | null;
    assessment?: { attemptId: string; answers: number[] };
  }) {
    const course = getCourse(input.courseId);
    const validLessonIds = new Set(
      course.courseLessons.map((_, index) => `lesson-${index + 1}`),
    );
    const completedLessonIds = input.completedLessonIds ?? [];
    if (completedLessonIds.some((id) => !validLessonIds.has(id))) {
      throw new ApplicationError(
        "A etapa informada não pertence ao curso.",
        400,
      );
    }
    if (input.lastLessonId && !validLessonIds.has(input.lastLessonId)) {
      throw new ApplicationError(
        "A etapa informada não pertence ao curso.",
        400,
      );
    }
    if (
      completedLessonIds.length === 0 &&
      !input.lastLessonId &&
      !input.assessment
    ) {
      throw new ApplicationError("Informe o progresso para salvar.", 400);
    }

    let score: number | null = null;
    let passed = false;
    if (input.assessment) {
      if (input.assessment.answers.length !== course.assessment.length) {
        throw new ApplicationError("A prova está incompleta.", 400);
      }
      if (
        input.assessment.answers.some(
          (answer, index) =>
            answer < 0 || answer >= course.assessment[index].options.length,
        )
      ) {
        throw new ApplicationError(
          "A prova contém uma resposta inválida.",
          400,
        );
      }
      const correctAnswers = input.assessment.answers.reduce(
        (count, answer, index) =>
          count +
          Number(answer === course.assessment[index].correctOptionIndex),
        0,
      );
      score = calculateLearningAssessmentScore(
        correctAnswers,
        course.assessment.length,
      );
      passed = score >= learningAssessmentPassScore;
    }

    const saved = await learningCourseProgressRepository.save({
      courseId: input.courseId,
      courseVersion: assetClassLearningCourseVersion,
      completedLessonIds,
      lastLessonId: input.lastLessonId ?? null,
      latestScore: score,
      attemptId: input.assessment?.attemptId ?? null,
      passed,
    });
    return {
      progress: toProgressDto(saved.progress),
      assessment: saved.attempt
        ? {
            score: saved.attempt.score,
            passed: saved.attempt.passed,
          }
        : null,
    };
  }
}

export const learningCourseProgressService =
  new LearningCourseProgressService();
