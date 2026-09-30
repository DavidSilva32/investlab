/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StudyListEntryCard,
  type StudyEntry,
} from "@/app/study-list/_components/study-list-entry-card";

afterEach(cleanup);

const entry: StudyEntry = {
  issuerCnpj: "12345678000199",
  companyName: "Empresa exemplo",
  ticker: "EXMP3",
  reason: "Avaliar o modelo de negócio.",
  addedAt: "2026-09-01T12:00:00.000Z",
  availableTickers: ["EXMP3"],
  observations: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      issuerCnpj: "12345678000199",
      text: "Nota original.",
      createdAt: "2026-09-02T12:00:00.000Z",
      updatedAt: "2026-09-03T12:00:00.000Z",
    },
  ],
};
const props = (
  overrides: Partial<React.ComponentProps<typeof StudyListEntryCard>> = {},
) => ({
  entry,
  pending: false,
  onRemove: vi.fn().mockResolvedValue(true),
  onUpdateReason: vi.fn().mockResolvedValue(true),
  onAddObservation: vi.fn().mockResolvedValue(true),
  onUpdateObservation: vi.fn().mockResolvedValue(true),
  ...overrides,
});

describe("StudyListEntryCard", () => {
  it("shows analysis access, reason, and manual observation editing", async () => {
    const callbacks = props();
    render(<StudyListEntryCard {...callbacks} />);
    expect(
      screen.getByRole("link", { name: "Analisar EXMP3" }).getAttribute("href"),
    ).toBe("/analyses?ticker=EXMP3");
    expect(screen.getByText("Avaliar o modelo de negócio.")).toBeTruthy();
    expect(screen.getByText(/Editada em/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Editar motivo" }));
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Editar motivo da inclusão para Empresa exemplo",
      }),
      { target: { value: "Motivo novo" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar motivo" }));
    await waitFor(() =>
      expect(callbacks.onUpdateReason).toHaveBeenCalledWith("Motivo novo"),
    );
    expect(
      screen.queryByRole("textbox", {
        name: "Editar motivo da inclusão para Empresa exemplo",
      }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("Nova observação"), {
      target: { value: "Nova nota" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar observação" }),
    );
    await waitFor(() =>
      expect(callbacks.onAddObservation).toHaveBeenCalledWith("Nova nota"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Editar observação de Empresa exemplo",
      }),
      { target: { value: "Nota revisada" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    await waitFor(() =>
      expect(callbacks.onUpdateObservation).toHaveBeenCalledWith(
        entry.observations[0]!.id,
        "Nota revisada",
      ),
    );
  });

  it("confirms removal accessibly and allows cancellation without deleting notes", async () => {
    const callbacks = props();
    render(<StudyListEntryCard {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(
      await screen.findByText(/todas as observações pessoais/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(callbacks.onRemove).not.toHaveBeenCalled();
    expect(screen.getByText("Nota original.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Remover empresa" }),
    );
    await waitFor(() => expect(callbacks.onRemove).toHaveBeenCalledOnce());
  });

  it("prevents dismissing removal while the delete request is pending", async () => {
    let resolveRemoval!: (value: boolean) => void;
    const callbacks = props({
      onRemove: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveRemoval = resolve;
          }),
      ),
    });
    const view = render(<StudyListEntryCard {...callbacks} pending={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Remover empresa" }),
    );
    view.rerender(<StudyListEntryCard {...callbacks} pending />);
    expect(
      screen.getByRole("button", { name: "Cancelar" }).hasAttribute("disabled"),
    ).toBe(true);
    await userEvent.setup().keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    resolveRemoval(true);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("keeps editors and confirmation open after failed callbacks and renders entries without analysis", async () => {
    const callbacks = props({
      entry: { ...entry, ticker: null, availableTickers: [], observations: [] },
      onRemove: vi.fn().mockResolvedValue(false),
      onUpdateReason: vi.fn().mockResolvedValue(false),
      onAddObservation: vi.fn().mockResolvedValue(false),
      onUpdateObservation: vi.fn().mockResolvedValue(false),
    });
    render(<StudyListEntryCard {...callbacks} />);
    expect(screen.getByText(/Análise indisponível/)).toBeTruthy();
    expect(
      screen.getByText("Nenhuma observação registrada ainda."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Editar motivo" }));
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Editar motivo da inclusão para Empresa exemplo",
      }),
      { target: { value: "Outro" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar motivo" }));
    await waitFor(() => expect(callbacks.onUpdateReason).toHaveBeenCalled());
    expect(
      screen.getByRole("textbox", {
        name: "Editar motivo da inclusão para Empresa exemplo",
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.change(screen.getByLabelText("Nova observação"), {
      target: { value: "Nota" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar observação" }),
    );
    await waitFor(() => expect(callbacks.onAddObservation).toHaveBeenCalled());
    expect(screen.getByLabelText("Nova observação")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Remover empresa" }),
    );
    await waitFor(() => expect(callbacks.onRemove).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
