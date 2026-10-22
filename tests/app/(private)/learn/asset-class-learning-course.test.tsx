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
import { assetClassLearningContent } from "@/lib/asset-class-learning";

afterEach(cleanup);

let savedCourses: Record<string, unknown>[] = [];

beforeEach(() => {
  savedCourses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const request = JSON.parse(String(init.body)) as {
          courseId: string;
          completedLessonIds?: string[];
          lastLessonId?: string;
          assessment?: { answers: number[] };
        };
        return Response.json({
          progress: {
            courseId: request.courseId,
            courseVersion: 1,
            completedLessonIds: request.completedLessonIds ?? [],
            lastLessonId: request.lastLessonId ?? null,
            latestScore: request.assessment ? 10 : null,
            bestScore: request.assessment ? 10 : null,
            quizAttemptCount: request.assessment ? 1 : 0,
            passed: Boolean(request.assessment),
            passedAt: null,
            updatedAt: new Date().toISOString(),
          },
          assessment: request.assessment ? { score: 10, passed: true } : null,
        });
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
});
