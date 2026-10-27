// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetClassLearningCourse } from "@/app/(private)/learn/_components/asset-class-learning-course";
import {
  assetClassLearningContent,
  type AssetClassLearningContent,
} from "@/lib/asset-class-learning";

afterEach(cleanup);

let savedCourses: Record<string, unknown>[] = [];
let failNextGet = false;
let failNextGetWithMessage = false;
let malformedNextGet = false;
let failNextPut = false;
let malformedNextPut = false;
let omitNextAssessment = false;
let assessmentBestScore: number | null = 10;
let holdNextPut = false;
let resolveHeldPut: (() => void) | null = null;

beforeEach(() => {
  savedCourses = [];
  failNextGet = false;
  failNextGetWithMessage = false;
  malformedNextGet = false;
  failNextPut = false;
  malformedNextPut = false;
  omitNextAssessment = false;
  assessmentBestScore = 10;
  holdNextPut = false;
  resolveHeldPut = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        if (failNextPut) {
          failNextPut = false;
          return Response.json(
            { message: "Falha temporária." },
            { status: 503 },
          );
        }
        const request = JSON.parse(String(init.body)) as {
          courseId: string;
          completedLessonIds?: string[];
          lastLessonId?: string;
          assessment?: { answers: number[] };
        };
        if (malformedNextPut) {
          malformedNextPut = false;
          return Response.json({ message: "Resposta incompleta." });
        }
        const omitAssessment = request.assessment && omitNextAssessment;
        if (omitAssessment) omitNextAssessment = false;
        const assessmentSaved = Boolean(request.assessment && !omitAssessment);
        const responseBody = {
          progress: {
            courseId: request.courseId,
            courseVersion: 2,
            hasCurrentVersionProgress: true,
            currentVersionPassed: assessmentSaved,
            completedLessonIds: request.completedLessonIds ?? [],
            lastLessonId: request.lastLessonId ?? null,
            latestScore: assessmentSaved ? 10 : null,
            bestScore: assessmentSaved ? assessmentBestScore : null,
            quizAttemptCount: assessmentSaved ? 1 : 0,
            passed: assessmentSaved,
            passedAt: null,
            updatedAt: new Date().toISOString(),
          },
          assessment:
            request.assessment && !omitAssessment
              ? { score: 10, passed: true }
              : null,
        };
        if (holdNextPut) {
          holdNextPut = false;
          return new Promise<Response>((resolve) => {
            resolveHeldPut = () => resolve(Response.json(responseBody));
          });
        }
        return Response.json(responseBody);
      }
      if (failNextGet) {
        failNextGet = false;
        throw new Error("Temporary network failure");
      }
      if (failNextGetWithMessage) {
        failNextGetWithMessage = false;
        return Response.json(
          { message: "Progresso bloqueado." },
          { status: 403 },
        );
      }
      if (malformedNextGet) {
        malformedNextGet = false;
        return Response.json({});
      }
      return Response.json({
        courses: savedCourses.map((course) => ({
          hasCurrentVersionProgress: true,
          currentVersionPassed: Boolean(course.passed),
          ...course,
        })),
      });
    }),
  );
});

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

async function answerCorrect(question: {
  options: { text: string }[];
  correctOptionIndex: number;
}) {
  fireEvent.click(
    await screen.findByRole("radio", {
      name: question.options[question.correctOptionIndex].text,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));
  await waitFor(() => {
    expect(
      screen
        .getByRole("button", {
          name: /Próxima aula|Começar prova|Próxima pergunta|Ver resultado/,
        })
        .hasAttribute("disabled"),
    ).toBe(false);
  });
}

describe("AssetClassLearningCourse", () => {
  it("teaches through video, lesson checks, visuals, and a final exam", async () => {
    const content = assetClassLearningContent.fiis;
    render(<AssetClassLearningCourse selectedClass="fiis" content={content} />);

    expect(
      screen.getByRole("region", {
        name: "Mini-curso: Fundos imobiliários (FIIs)",
      }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("heading", {
        name: content.courseLessons[0].title,
      }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(/Vídeo educativo/) instanceof HTMLVideoElement,
    ).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Assista à aula" }),
    ).toBeTruthy();
    expect(await screen.findAllByRole("radio")).toHaveLength(4);
    expect(
      screen
        .getByRole("button", { name: "Próxima aula" })
        .hasAttribute("disabled"),
    ).toBe(true);

    await answerCorrect(content.courseLessons[0].question);
    fireEvent.click(screen.getByRole("button", { name: "Próxima aula" }));
    expect(
      screen.getByRole("heading", { name: content.courseLessons[1].title }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(
      screen.getByRole("heading", { name: content.courseLessons[0].title }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Próxima aula" }));
    expect(
      screen.getByRole("region", {
        name: "Exemplos de imóveis de fundos imobiliários",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Shoppings" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Galpões logísticos" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Imóveis residenciais" }),
    ).toBeTruthy();

    for (let index = 1; index < content.courseLessons.length; index += 1) {
      await answerCorrect(content.courseLessons[index].question);
      fireEvent.click(
        screen.getByRole("button", {
          name:
            index === content.courseLessons.length - 1
              ? "Começar prova"
              : "Próxima aula",
        }),
      );
    }

    expect(
      screen.getAllByRole("heading", { name: "Prova final" }),
    ).toHaveLength(2);
    expect(screen.getByText("1 de 10")).toBeTruthy();
    expect(await screen.findAllByRole("radio")).toHaveLength(4);
  });

  it("keeps the lesson available when its video is coming soon", async () => {
    const { videoSrc: _videoSrc, ...contentWithoutVideo } =
      assetClassLearningContent.fiis;
    const content: AssetClassLearningContent = {
      ...contentWithoutVideo,
      availability: "coming-soon",
    };
    render(<AssetClassLearningCourse selectedClass="fiis" content={content} />);

    expect(await screen.findByText("Vídeo em breve")).toBeTruthy();
  });

  it("allows lesson review and celebrates passing the assessment", async () => {
    const content = assetClassLearningContent.fixed_income;
    render(
      <AssetClassLearningCourse
        selectedClass="fixed_income"
        content={content}
      />,
    );

    await screen.findByRole("heading", {
      name: content.courseLessons[0].title,
    });

    for (const [index, lesson] of content.courseLessons.entries()) {
      await answerCorrect(lesson.question);
      fireEvent.click(
        screen.getByRole("button", {
          name:
            index === content.courseLessons.length - 1
              ? "Começar prova"
              : "Próxima aula",
        }),
      );
    }

    assessmentBestScore = null;
    for (const [index, question] of content.assessment.entries()) {
      await answerCorrect(question);
      fireEvent.click(
        screen.getByRole("button", {
          name:
            index === content.assessment.length - 1
              ? "Ver resultado"
              : "Próxima pergunta",
        }),
      );
    }

    await screen.findByText("Você conquistou sua medalha!");

    const completion = screen
      .getAllByRole("status")
      .find((status) =>
        status.textContent?.includes("Você conquistou sua medalha!"),
      );
    expect(completion?.textContent).toContain("Primeira aprovação registrada");
    expect(completion?.textContent).toContain("10,0/10");
    fireEvent.click(
      screen.getByRole("button", { name: "Etapa 1: O que é renda fixa?" }),
    );
    expect(
      screen.getByRole("heading", { name: content.courseLessons[0].title }),
    ).toBeTruthy();
  });

  it("restores a permanent approval when the latest saved attempt scored below seven", async () => {
    savedCourses = [
      {
        courseId: "fixed_income",
        courseVersion: 2,
        completedLessonIds: ["lesson-1", "lesson-2", "lesson-3", "lesson-4"],
        lastLessonId: "lesson-4",
        latestScore: 6,
        bestScore: 8,
        quizAttemptCount: 3,
        passed: true,
        passedAt: "2026-10-22T10:00:00.000Z",
        updatedAt: "2026-10-22T10:01:00.000Z",
      },
    ];
    const content = assetClassLearningContent.fixed_income;
    render(
      <AssetClassLearningCourse
        selectedClass="fixed_income"
        content={content}
      />,
    );

    await screen.findByRole("heading", {
      name: "Aprovação anterior preservada",
    });
    const completion = screen
      .getAllByRole("status")
      .find((status) =>
        status.textContent?.includes("Aprovação anterior preservada"),
      );
    expect(completion?.textContent).toContain("6,0/10");
    expect(completion?.textContent).toContain("Melhor nota aprovada: 8,0/10.");
  });

  it("resumes after the last lesson when that lesson was saved as complete", async () => {
    savedCourses = [
      {
        courseId: "fiis",
        courseVersion: 2,
        completedLessonIds: ["lesson-1"],
        lastLessonId: "lesson-1",
        latestScore: null,
        bestScore: null,
        quizAttemptCount: 0,
        passed: false,
        passedAt: null,
        updatedAt: new Date().toISOString(),
      },
    ];
    render(
      <AssetClassLearningCourse
        selectedClass="fiis"
        content={assetClassLearningContent.fiis}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: assetClassLearningContent.fiis.courseLessons[1].title,
      }),
    ).toBeTruthy();
  });

  it("uses a safe message when the saved progress response is malformed", async () => {
    malformedNextGet = true;
    render(
      <AssetClassLearningCourse
        selectedClass="fiis"
        content={assetClassLearningContent.fiis}
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Não foi possível carregar seu progresso.",
    );
  });

  it("preserves a legacy medal but requires the learner to repeat updated lessons", async () => {
    savedCourses = [
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
        passedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    render(
      <AssetClassLearningCourse
        selectedClass="fiis"
        content={assetClassLearningContent.fiis}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: assetClassLearningContent.fiis.courseLessons[0].title,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Sua medalha anterior continua no perfil. As aulas foram atualizadas; conclua esta edição para registrar o progresso e a nota atuais.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("8,0/10")).toBeNull();
  });

  it("resumes lesson two when a historical medal exists but current-version progress has no result", async () => {
    savedCourses = [
      {
        courseId: "fiis",
        courseVersion: 2,
        hasCurrentVersionProgress: true,
        currentVersionPassed: false,
        completedLessonIds: ["lesson-1"],
        lastLessonId: "lesson-1",
        latestScore: null,
        bestScore: null,
        quizAttemptCount: 0,
        passed: true,
        passedAt: "2026-10-20T10:00:00.000Z",
        updatedAt: "2026-10-22T10:00:00.000Z",
      },
    ];
    render(
      <AssetClassLearningCourse
        selectedClass="fiis"
        content={assetClassLearningContent.fiis}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: assetClassLearningContent.fiis.courseLessons[1].title,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Sua medalha anterior continua no perfil. As aulas foram atualizadas; conclua esta edição para registrar o progresso e a nota atuais.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Prova final" })).toBeNull();
  });

  it("shows the preserved medal message on the updated course assessment", async () => {
    const content = assetClassLearningContent.fiis;
    savedCourses = [
      {
        courseId: "fiis",
        courseVersion: 2,
        hasCurrentVersionProgress: true,
        currentVersionPassed: false,
        completedLessonIds: content.courseLessons.map(
          (_, index) => `lesson-${index + 1}`,
        ),
        lastLessonId: `lesson-${content.courseLessons.length}`,
        latestScore: null,
        bestScore: null,
        quizAttemptCount: 0,
        passed: true,
        passedAt: "2026-10-20T10:00:00.000Z",
        updatedAt: "2026-10-22T10:00:00.000Z",
      },
    ];

    render(<AssetClassLearningCourse selectedClass="fiis" content={content} />);

    expect(
      await screen.findAllByRole("heading", { name: "Prova final" }),
    ).toHaveLength(2);
    expect(
      screen.getByText(
        "Sua medalha anterior foi preservada. Faça a prova atualizada para registrar uma nova nota.",
      ),
    ).toBeTruthy();
  });

  it("shows a retry when progress cannot load and recovers on retry", async () => {
    failNextGet = true;
    render(
      <AssetClassLearningCourse
        selectedClass="fiis"
        content={assetClassLearningContent.fiis}
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Não foi possível carregar seu progresso.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("heading", {
        name: assetClassLearningContent.fiis.courseLessons[0].title,
      }),
    ).toBeTruthy();
  });

  it("shows a safe API message when access to saved progress is denied", async () => {
    failNextGetWithMessage = true;
    render(
      <AssetClassLearningCourse
        selectedClass="fiis"
        content={assetClassLearningContent.fiis}
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Progresso bloqueado.",
    );
  });

  it("lets the learner retry saving a lesson checkpoint after a temporary failure", async () => {
    failNextPut = true;
    const content = assetClassLearningContent.fiis;
    render(<AssetClassLearningCourse selectedClass="fiis" content={content} />);
    await screen.findByRole("heading", {
      name: content.courseLessons[0].title,
    });

    fireEvent.click(
      await screen.findByRole("radio", {
        name: content.courseLessons[0].question.options[
          content.courseLessons[0].question.correctOptionIndex
        ].text,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Falha temporária.",
    );
    failNextPut = true;
    const callsBeforeRetry = vi.mocked(fetch).mock.calls.length;
    fireEvent.click(
      screen.getByRole("button", { name: "Tentar salvar novamente" }),
    );
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(callsBeforeRetry + 1);
    });
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Falha temporária.",
    );
    holdNextPut = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Tentar salvar novamente" }),
    );
    await screen.findByRole("button", { name: "Salvando…" });
    resolveHeldPut?.();
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(4);
    });
  });

  it("uses a safe message when a checkpoint response is malformed", async () => {
    malformedNextPut = true;
    const content = assetClassLearningContent.fiis;
    render(<AssetClassLearningCourse selectedClass="fiis" content={content} />);
    await screen.findByRole("heading", {
      name: content.courseLessons[0].title,
    });

    fireEvent.click(
      await screen.findByRole("radio", {
        name: content.courseLessons[0].question.options[
          content.courseLessons[0].question.correctOptionIndex
        ].text,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Não foi possível salvar seu progresso.",
    );
  });

  it("does not save a lesson when the learner clears an answer to try again", async () => {
    const content = assetClassLearningContent.fiis;
    render(<AssetClassLearningCourse selectedClass="fiis" content={content} />);
    await screen.findByRole("heading", {
      name: content.courseLessons[0].title,
    });

    fireEvent.click(
      await screen.findByRole("radio", {
        name: content.courseLessons[0].question.options[1].text,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));
    await screen.findByRole("status");
    const callsBeforeRetry = vi.mocked(fetch).mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(callsBeforeRetry);
    expect(
      screen
        .getByRole("button", { name: "Conferir resposta" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("does not reveal an incorrect answer before checking or mark a wrong answer complete", async () => {
    const content = assetClassLearningContent.fiis;
    render(<AssetClassLearningCourse selectedClass="fiis" content={content} />);
    await screen.findByRole("heading", {
      name: content.courseLessons[0].title,
    });
    await screen.findAllByRole("radio");

    const wrongOption = content.courseLessons[0].question.options.find(
      (_, index) =>
        index !== content.courseLessons[0].question.correctOptionIndex,
    );
    expect(wrongOption).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: wrongOption!.text }));
    expect(screen.queryByText("Quase lá")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Próxima aula" })
        .hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));
    expect(await screen.findByText("Quase lá")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Próxima aula" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.queryByText("Quase lá")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Conferir resposta" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("keeps a retry when the assessment result was not persisted", async () => {
    const content = assetClassLearningContent.fiis;
    render(<AssetClassLearningCourse selectedClass="fiis" content={content} />);
    await screen.findByRole("heading", {
      name: content.courseLessons[0].title,
    });

    for (const lesson of content.courseLessons) {
      await answerCorrect(lesson.question);
      fireEvent.click(
        screen.getByRole("button", {
          name:
            lesson === content.courseLessons.at(-1)
              ? "Começar prova"
              : "Próxima aula",
        }),
      );
    }

    for (const [index, question] of content.assessment.entries()) {
      await answerCorrect(question);
      if (index === content.assessment.length - 1) omitNextAssessment = true;
      fireEvent.click(
        screen.getByRole("button", {
          name:
            index === content.assessment.length - 1
              ? "Ver resultado"
              : "Próxima pergunta",
        }),
      );
    }

    expect((await screen.findByRole("alert")).textContent).toContain(
      "suas respostas foram mantidas",
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver resultado" }));
    await screen.findByText("Você conquistou sua medalha!");
  });
});
