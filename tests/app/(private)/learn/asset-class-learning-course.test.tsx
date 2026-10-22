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
        const responseBody = {
          progress: {
            courseId: request.courseId,
            courseVersion: 1,
            completedLessonIds: request.completedLessonIds ?? [],
            lastLessonId: request.lastLessonId ?? null,
            latestScore: request.assessment ? 10 : null,
            bestScore: request.assessment ? assessmentBestScore : null,
            quizAttemptCount: request.assessment ? 1 : 0,
            passed: Boolean(request.assessment),
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
      return Response.json({ courses: savedCourses });
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
      screen.getByRole("list", { name: "Exemplos de ativos imobiliários" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Shoppings" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Galpões logísticos" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Imóveis residenciais" }),
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
    expect(screen.getByText("1 de 5")).toBeTruthy();
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

    await screen.findByText("Curso concluído!");

    const completion = screen
      .getAllByRole("status")
      .find((status) => status.textContent?.includes("Curso concluído!"));
    expect(completion?.textContent).toContain("Curso concluído!");
    expect(completion?.textContent).toContain("medalha");
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
        courseVersion: 1,
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

    await screen.findByText("Curso concluído!");
    const completion = screen
      .getAllByRole("status")
      .find((status) => status.textContent?.includes("Curso concluído!"));
    expect(completion?.textContent).toContain(
      "Esta tentativa: 6,0/10. Melhor nota aprovada: 8,0/10.",
    );
  });

  it("resumes after the last lesson when that lesson was saved as complete", async () => {
    savedCourses = [
      {
        courseId: "fiis",
        courseVersion: 1,
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

  it("restores a legacy approval without an attempt score or saved best score", async () => {
    savedCourses = [
      {
        courseId: "fiis",
        courseVersion: 1,
        completedLessonIds: ["lesson-1", "lesson-2", "lesson-3", "lesson-4"],
        lastLessonId: "lesson-4",
        latestScore: null,
        bestScore: null,
        quizAttemptCount: 1,
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

    const completion = await screen.findByText("Curso concluído!");
    expect(completion.textContent).toBe("Curso concluído!");
    expect(
      screen.getByText("Você recebeu a medalha de conclusão."),
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
    await screen.findByText("Curso concluído!");
  });
});
