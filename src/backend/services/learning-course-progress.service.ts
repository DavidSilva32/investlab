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
    ReturnType<typeof learningCourseProgressRepository.listForCurrentOwner>
  >[number],
) {
  return {
    courseId: row.courseId,
    courseVersion: row.courseVersion,
    completedLessonIds: row.completedLessonIds,
    lastLessonId: row.lastLessonId,
    latestScore: row.latestScore,
    bestScore: row.bestScore,
    quizAttemptCount: row.quizAttemptCount,
    currentVersionPassed:
      row.courseVersion === assetClassLearningCourseVersion &&
      row.passedAt !== null,
    passed: row.passedAt !== null,
    passedAt: row.passedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mergeCourseProgress(
  rows: Awaited<
    ReturnType<typeof learningCourseProgressRepository.listForCurrentOwner>
  >,
  courseId: string,
) {
  const courseRows = rows
    .filter((row) => row.courseId === courseId)
    .sort((left, right) => right.courseVersion - left.courseVersion);
  if (courseRows.length === 0) return null;

  const currentVersionRow = courseRows.find(
    (row) => row.courseVersion === assetClassLearningCourseVersion,
  );
  const activeRow = currentVersionRow ?? courseRows[0];
  const passedRows = courseRows.filter((row) => row.passedAt !== null);
  const completedLessonIds = currentVersionRow?.completedLessonIds ?? [];
  const lastLessonId = currentVersionRow?.lastLessonId ?? null;
  const latestUpdatedAt = courseRows.reduce(
    (latest, row) => (row.updatedAt > latest ? row.updatedAt : latest),
    activeRow.updatedAt,
  );
  const currentExamData =
    activeRow.courseVersion === assetClassLearningCourseVersion;

  return {
    ...toProgressDto(activeRow),
    courseVersion: assetClassLearningCourseVersion,
    hasCurrentVersionProgress: Boolean(currentVersionRow),
    completedLessonIds,
    lastLessonId,
    currentVersionPassed: Boolean(currentVersionRow?.passedAt),
    latestScore: currentExamData ? activeRow.latestScore : null,
    bestScore: currentExamData ? activeRow.bestScore : null,
    quizAttemptCount: currentExamData ? activeRow.quizAttemptCount : 0,
    passed: passedRows.length > 0,
    passedAt:
      activeRow.passedAt?.toISOString() ??
      passedRows
        .map((row) => row.passedAt)
        .filter((passedAt): passedAt is Date => passedAt !== null)
        .sort((left, right) => left.getTime() - right.getTime())[0]
        ?.toISOString() ??
      null,
    updatedAt: latestUpdatedAt.toISOString(),
  };
}

export class LearningCourseProgressService {
  async listCurrentOwnerProgress() {
    const rows = await learningCourseProgressRepository.listForCurrentOwner();
    return {
      courses: Object.keys(assetClassLearningContent)
        .map((courseId) => mergeCourseProgress(rows, courseId))
        .filter((progress) => progress !== null),
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
    const allRows =
      await learningCourseProgressRepository.listForCurrentOwner();
    return {
      progress: mergeCourseProgress(allRows, input.courseId) ?? {
        ...toProgressDto(saved.progress),
        hasCurrentVersionProgress: true,
      },
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
