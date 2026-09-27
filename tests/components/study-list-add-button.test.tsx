/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { AddStudyListButton } from "@/components/study-list-add-button";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  });
}

describe("AddStudyListButton", () => {
  it("requires a reason, posts the issuer identity, and marks a newly added issuer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ added: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AddStudyListButton
        issuerCnpj="12345678000199"
        companyName="Empresa exemplo"
        ticker="EXMP3"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /adicionar à lista/i }));
    const submit = screen.getByRole("button", { name: "Adicionar" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Motivo da inclusão"), {
      target: { value: "Estudar o negócio" },
    });
    expect(submit.hasAttribute("disabled")).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({
      issuerCnpj: "12345678000199",
      companyName: "Empresa exemplo",
      ticker: "EXMP3",
      reason: "Estudar o negócio",
    });
    expect(
      await screen.findByRole("button", { name: "Na Lista de estudo" }),
    ).toBeTruthy();
  });

  it("keeps each open reason field associated with its own label", () => {
    render(
      <>
        <AddStudyListButton
          issuerCnpj="12345678000199"
          companyName="Empresa um"
          ticker="EXMP3"
        />
        <AddStudyListButton
          issuerCnpj="12345678000270"
          companyName="Empresa dois"
          ticker="EXMP4"
        />
      </>,
    );

    const triggers = screen.getAllByRole("button", {
      name: /Adicionar.*Lista de estudo/,
    });
    fireEvent.click(triggers[0]!);
    fireEvent.click(triggers[1]!);

    const fields = screen.getAllByLabelText(/Motivo da inclus/);
    expect(fields).toHaveLength(2);
    expect(fields[0]!.id).not.toBe(fields[1]!.id);
    for (const field of fields) {
      expect(document.querySelector(`label[for="${field.id}"]`)).toBeTruthy();
    }
  });

  it("disables inclusion when the market source did not resolve a CNPJ", () => {
    render(
      <AddStudyListButton
        issuerCnpj={null}
        companyName="Empresa exemplo"
        ticker="EXMP3"
      />,
    );
    expect(
      screen.getByText(
        "O CNPJ não foi identificado; a análise continua disponível.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /adicionar à lista/i })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("loads existing state when requested", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ entries: [{ issuerCnpj: "12345678000199" }] }),
      )
      .mockResolvedValueOnce(response({ added: false }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AddStudyListButton
        issuerCnpj="12345678000199"
        companyName="Empresa exemplo"
        ticker="EXMP3"
        checkExisting
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Na Lista de estudo" }),
    ).toBeTruthy();
  });

  it("reports a duplicate response without overwriting the existing entry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ added: false }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AddStudyListButton
        issuerCnpj="12345678000199"
        companyName="Empresa exemplo"
        ticker="EXMP3"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /adicionar à lista/i }));
    fireEvent.change(screen.getByLabelText("Motivo da inclusão"), {
      target: { value: "Outro motivo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "já está na Lista de estudo",
    );
  });
  it("keeps inclusion available when checking the existing list fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue("offline");
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AddStudyListButton
        issuerCnpj="12345678000199"
        companyName="Empresa exemplo"
        ticker="EXMP3"
        checkExisting
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("button", { name: "Adicionar à Lista de estudo" }),
    ).toBeTruthy();
  });
  it("keeps inclusion available when the existing-list endpoint returns an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: "Falha temporária." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AddStudyListButton
        issuerCnpj="12345678000199"
        companyName="Empresa exemplo"
        ticker="EXMP3"
        checkExisting
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("button", { name: "Adicionar à Lista de estudo" }),
    ).toBeTruthy();
  });
  it("closes the reason dialog without saving when cancelled", () => {
    render(
      <AddStudyListButton
        issuerCnpj="12345678000199"
        companyName="Empresa exemplo"
        ticker="EXMP3"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /adicionar à lista/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not request an existing list when the parent already marked the issuer saved", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AddStudyListButton
        issuerCnpj="12345678000199"
        companyName="Empresa exemplo"
        ticker="EXMP3"
        alreadyAdded
        checkExisting
      />,
    );
    expect(
      screen.getByRole("button", { name: "Na Lista de estudo" }),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes the reason dialog with Escape", async () => {
    const user = userEvent.setup();
    render(
      <AddStudyListButton
        issuerCnpj="12345678000199"
        companyName="Empresa exemplo"
        ticker="EXMP3"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /adicionar à lista/i }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows a fallback when the save request rejects without an Error object", async () => {
    const fetchMock = vi.fn().mockRejectedValue("offline");
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AddStudyListButton
        issuerCnpj="12345678000199"
        companyName="Empresa exemplo"
        ticker={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /adicionar à lista/i }));
    fireEvent.change(screen.getByLabelText("Motivo da inclusão"), {
      target: { value: "Estudar o negócio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível adicionar a empresa à Lista de estudo.",
    );
  });
  it("shows a safe error when the add request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ message: "Falha ao salvar." }, false));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AddStudyListButton
        issuerCnpj="12345678000199"
        companyName="Empresa exemplo"
        ticker={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /adicionar à lista/i }));
    fireEvent.change(screen.getByLabelText("Motivo da inclusão"), {
      target: { value: "Estudar o negócio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Falha ao salvar.",
    );
  });
});
