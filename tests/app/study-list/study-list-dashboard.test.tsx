/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyListDashboard } from "@/app/study-list/_components/study-list-dashboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const firstEntry = {
  issuerCnpj: "12345678000199",
  companyName: "Empresa exemplo",
  ticker: "EXMP3",
  reason: "Quero entender o modelo de negócio.",
  addedAt: "2026-09-01T12:00:00.000Z",
  availableTickers: ["EXMP3"],
  observations: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      issuerCnpj: "12345678000199",
      text: "Nota original.",
      createdAt: "2026-09-02T12:00:00.000Z",
      updatedAt: "2026-09-02T12:00:00.000Z",
    },
  ],
};
const noAnalysisEntry = {
  issuerCnpj: "12345678000270",
  companyName: "Emissor sem ticker",
  ticker: null,
  reason: "Acompanhar publicação oficial.",
  addedAt: "2026-09-03T12:00:00.000Z",
  availableTickers: [],
  observations: [],
};

function response(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  });
}

describe("StudyListDashboard", () => {
  it("shows the loading message while the list request is pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<StudyListDashboard />);
    expect(screen.getByText("Carregando sua Lista de estudo…")).toBeTruthy();
  });

  it("shows the empty state and entry points", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ entries: [] })),
    );
    render(<StudyListDashboard />);
    expect(await screen.findByText("Sua lista ainda está vazia")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Ir para Descobrir" })
        .getAttribute("href"),
    ).toBe("/analyses");
    expect(
      screen
        .getByRole("link", { name: "Ir para Analisar" })
        .getAttribute("href"),
    ).toContain("/analyses?ticker=");
  });

  it("retries after a load error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ message: "Falha inicial." }, false))
      .mockResolvedValueOnce(response({ message: "Falha no retry." }, false))
      .mockRejectedValueOnce("offline")
      .mockResolvedValueOnce(response({ entries: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<StudyListDashboard />);
    expect(await screen.findByText("Falha inicial.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Falha no retry.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Lista de estudo agora.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("heading", { level: 2 })).toBeTruthy();
  });

  it("uses a safe message for initial network errors and ignores requests after unmount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce("offline"));
    const first = render(<StudyListDashboard />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar a Lista de estudo agora.",
    );
    first.unmount();

    let resolveRequest!: (value: {
      ok: boolean;
      json: () => Promise<unknown>;
    }) => void;
    const pendingSuccess = new Promise<{
      ok: boolean;
      json: () => Promise<unknown>;
    }>((resolve) => {
      resolveRequest = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pendingSuccess));
    const success = render(<StudyListDashboard />);
    success.unmount();
    resolveRequest({ ok: true, json: () => Promise.resolve({ entries: [] }) });
    await Promise.resolve();
    await Promise.resolve();

    let rejectRequest!: (reason: unknown) => void;
    const pendingFailure = new Promise<never>((_resolve, reject) => {
      rejectRequest = reject;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pendingFailure));
    const failure = render(<StudyListDashboard />);
    failure.unmount();
    rejectRequest("offline");
    await Promise.resolve();
    await Promise.resolve();
  });

  it("removes a stale entry when the server confirms it was already absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ entries: [firstEntry] }))
        .mockResolvedValueOnce(response({ removed: false })),
    );
    render(<StudyListDashboard />);
    expect(await screen.findByText("Empresa exemplo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Remover empresa" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Sua lista ainda está vazia")).toBeTruthy(),
    );
  });

  it("edits the inclusion reason without changing manual observations", async () => {
    const updatedEntry = { ...firstEntry, reason: "Motivo atualizado." };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ entries: [firstEntry, noAnalysisEntry] }),
      )
      .mockResolvedValueOnce(
        response({
          issuerCnpj: firstEntry.issuerCnpj,
          reason: "Motivo atualizado.",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<StudyListDashboard />);

    expect(await screen.findByText(firstEntry.reason)).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Editar motivo" })[0]!,
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: /Editar motivo da inclus.*para Empresa exemplo/,
      }),
      { target: { value: "  Motivo atualizado.  " } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar motivo" }));

    expect(await screen.findByText(updatedEntry.reason)).toBeTruthy();
    expect(screen.getByText("Nota original.")).toBeTruthy();
    expect(screen.getByText(noAnalysisEntry.reason)).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/study-list/12345678000199",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ reason: "Motivo atualizado." }),
      }),
    );
  });

  it("keeps the reason unchanged after failed saves and lets the user cancel", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ entries: [firstEntry] }))
      .mockResolvedValueOnce(
        response({ message: "Falha ao atualizar." }, false),
      )
      .mockResolvedValueOnce(response({}, true))
      .mockRejectedValueOnce("offline");
    vi.stubGlobal("fetch", fetchMock);
    render(<StudyListDashboard />);

    expect(await screen.findByText(firstEntry.reason)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Editar motivo" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Editar motivo/ }), {
      target: { value: "Novo motivo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar motivo" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Falha ao atualizar.",
      ),
    );
    expect(screen.getByRole("textbox", { name: /Editar motivo/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Salvar motivo" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("motivo da"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar motivo" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("motivo da"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText(firstEntry.reason)).toBeTruthy();
    expect(screen.getByText("Nota original.")).toBeTruthy();
  });

  it("keeps observations additive and editable, opens analysis when available, and removes an issuer", async () => {
    const updatedObservation = {
      ...firstEntry.observations[0]!,
      text: "Nota revisada.",
      updatedAt: "2026-09-05T12:00:00.000Z",
    };
    const appendedObservation = {
      id: "00000000-0000-4000-8000-000000000002",
      issuerCnpj: firstEntry.issuerCnpj,
      text: "Nova nota.",
      createdAt: "2026-09-04T12:00:00.000Z",
      updatedAt: "2026-09-04T12:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ entries: [firstEntry, noAnalysisEntry] }),
      )
      .mockResolvedValueOnce(response({ observation: appendedObservation }))
      .mockResolvedValueOnce(response({ observation: updatedObservation }))
      .mockResolvedValueOnce(response({ removed: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<StudyListDashboard />);

    expect(await screen.findByText("Nota original.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Analisar EXMP3" }).getAttribute("href"),
    ).toBe("/analyses?ticker=EXMP3");
    expect(screen.getByText(/Análise indisponível/)).toBeTruthy();

    const newNote = screen.getAllByLabelText("Nova observação")[0]!;
    fireEvent.change(newNote, { target: { value: "Nova nota." } });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Registrar observação" })[0]!,
    );
    expect(await screen.findByText("Nova nota.")).toBeTruthy();
    expect(screen.getByText("Nota original.")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]!);
    const editField = screen.getByRole("textbox", {
      name: "Editar observação de Empresa exemplo",
    });
    fireEvent.change(editField, { target: { value: "Nota revisada." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    expect(await screen.findByText("Nota revisada.")).toBeTruthy();
    expect(screen.getByText("Nova nota.")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Remover" })[0]!);
    expect(
      await screen.findByText(/todas as .* pessoais registradas/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remover empresa" }));
    await waitFor(() =>
      expect(screen.queryByText("Empresa exemplo")).toBeNull(),
    );
    expect(screen.getByText("Emissor sem ticker")).toBeTruthy();
  });

  it("keeps the entry visible and shows safe errors for note and removal failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ entries: [firstEntry] }))
      .mockResolvedValueOnce(response({}, true))
      .mockRejectedValueOnce(new Error("Falha ao registrar."))
      .mockResolvedValueOnce(response({ message: "Falha ao editar." }, false))
      .mockRejectedValueOnce("offline")
      .mockResolvedValueOnce(response({ message: "Falha ao remover." }, false))
      .mockRejectedValueOnce("offline");
    vi.stubGlobal("fetch", fetchMock);
    render(<StudyListDashboard />);
    expect(await screen.findByText("Nota original.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Nova observação"), {
      target: { value: "Nota que não salvou." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar observação" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível registrar a observação.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Registrar observação" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Falha ao registrar.",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Editar observação de Empresa exemplo",
      }),
      {
        target: { value: "Edição não salva." },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Falha ao editar.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Editar observação de Empresa exemplo",
      }),
      {
        target: { value: "Outra edição não salva." },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Não foi possível atualizar a observação.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Remover empresa" }),
    );
    expect(
      (await within(screen.getByRole("alertdialog")).findByRole("alert"))
        .textContent,
    ).toContain("Falha ao remover.");
    expect(screen.getByText("Empresa exemplo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remover empresa" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("alertdialog")).getByRole("alert").textContent,
      ).toContain("Não foi possível remover a empresa da Lista de estudo."),
    );
    expect(screen.getByText("Empresa exemplo")).toBeTruthy();
  });
});
