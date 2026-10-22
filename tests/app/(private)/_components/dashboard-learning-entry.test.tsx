// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardLearningEntry } from "@/app/(private)/_components/dashboard-learning-entry";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DashboardLearningEntry", () => {
  it("lists only courses without an approval and links directly to each one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          courses: [
            { courseId: "fiis", passed: true },
            { courseId: "brazilian_equities", passed: false },
          ],
        }),
      ),
    );
    render(<DashboardLearningEntry />);

    expect(await screen.findByText("Renda fixa")).toBeTruthy();
    expect(screen.getByText("Ações e BDRs")).toBeTruthy();
    expect(screen.getByText("ETFs internacionais")).toBeTruthy();
    expect(screen.queryByText("Fundos imobiliários (FIIs)")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Ações e BDRs" }).getAttribute("href"),
    ).toBe("/aprender?class=brazilian_equities#class-content");
    expect(screen.getByText("Faltam 3 cursos para concluir.")).toBeTruthy();
  });

  it("uses singular copy when one course remains", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          courses: [
            { courseId: "fixed_income", passed: true },
            { courseId: "brazilian_equities", passed: true },
            { courseId: "international_etfs", passed: true },
            { courseId: "fiis", passed: false },
          ],
        }),
      ),
    );
    render(<DashboardLearningEntry />);

    expect(await screen.findByText("Falta concluir 1 curso.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Fundos imobiliários (FIIs)" }),
    ).toBeTruthy();
  });

  it("hides the entry when every course has been approved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          courses: [
            { courseId: "fixed_income", passed: true },
            { courseId: "brazilian_equities", passed: true },
            { courseId: "international_etfs", passed: true },
            { courseId: "fiis", passed: true },
          ],
        }),
      ),
    );
    const { container } = render(<DashboardLearningEntry />);

    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("shows a neutral recovery state and can retry when progress fails to load", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        Response.json({
          courses: [{ courseId: "fiis", passed: true }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<DashboardLearningEntry />);

    expect(
      await screen.findByText("Não foi possível carregar seu progresso."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explorar cursos" })).toBeTruthy();
    expect(screen.getByText("Cursos de aprendizado")).toBeTruthy();
    expect(screen.queryByText(/Falta(m)? concluir/)).toBeNull();

    screen.getByRole("button", { name: "Tentar novamente" }).click();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Ações e BDRs")).toBeTruthy();
  });

  it("does not update state when pending progress resolves after unmount", async () => {
    let resolveRequest: (response: Response) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container, unmount } = render(<DashboardLearningEntry />);
    expect(fetchMock).toHaveBeenCalledOnce();
    unmount();

    await act(async () => {
      resolveRequest(Response.json({ courses: [] }));
    });

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Continue seu aprendizado")).toBeNull();
  });

  it("ignores a failed pending request after unmount", async () => {
    let rejectRequest: (error: Error) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container, unmount } = render(<DashboardLearningEntry />);
    expect(fetchMock).toHaveBeenCalledOnce();
    unmount();

    await act(async () => {
      rejectRequest(new Error("offline"));
    });

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
