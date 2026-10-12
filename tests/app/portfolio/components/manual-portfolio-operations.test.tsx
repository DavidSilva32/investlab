// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { ManualPortfolioOperations } from "@/app/portfolio/_components/manual-portfolio-operations";

const operation = {
  id: "op-1",
  side: "BUY",
  effectiveDate: "2026-10-01",
  product: "Empresa Exemplo",
  assetCode: "EXMP3",
  quantity: "2",
  unitPrice: "10.25",
  currency: "BRL",
  fees: null,
};
const movement = {
  id: "movement-1",
  occurredAt: "2026-10-01",
  movementType: "Compra",
  product: "Empresa Exemplo - EXMP3",
  assetCode: "EXMP3",
  quantity: "2",
  unitPrice: "10.30",
  operationValue: "20.60",
  direction: "CREDITO",
};
const candidate = {
  operationId: operation.id,
  movementId: movement.id,
  operationSide: "BUY",
  operationProduct: operation.product,
  operationAssetCode: operation.assetCode,
  operationQuantity: "2",
  operationUnitPrice: "10.25",
  operationCurrency: "BRL",
  operationFees: null,
  movement,
  monetaryValuesComparable: false,
  limitation:
    "A planilha da B3 não informa a moeda; os valores monetários não são comparáveis.",
};
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });

describe("ManualPortfolioOperations", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    toast.success.mockReset();
    toast.error.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows pending match evidence without assigning a B3 currency and confirms only after explicit review", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          operations: [operation],
          movements: [movement],
          pendingMovements: [movement],
          candidates: [candidate],
          links: [],
        }),
      )
      .mockResolvedValueOnce(response({ id: "event-1" }))
      .mockResolvedValueOnce(
        response({
          operations: [operation],
          movements: [movement],
          pendingMovements: [],
          candidates: [],
          links: [{ operationId: operation.id, movementId: movement.id }],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<ManualPortfolioOperations />);

    expect(
      await screen.findByText(/A planilha da B3 não informa a moeda/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Tipo e direção da B3 são dados brutos/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Esses valores não foram usados/).parentElement
        ?.textContent,
    ).toContain("Preço unitário B3: 10.30");
    fireEvent.click(
      screen.getByRole("button", { name: "Revisar e confirmar" }),
    );
    const reviewDialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(reviewDialog).getByRole("button", { name: "Cancelar" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Revisar e confirmar" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirmar vínculo" }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetch.mock.calls[1]![1].body as string)).toEqual({
      operationId: operation.id,
      movementId: movement.id,
      action: "LINK",
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Vínculo confirmado e registrado no histórico.",
    );
    expect(await screen.findByText("Conciliada")).toBeTruthy();
  });

  it("records a manual operation with explicit side, date and currency", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          operations: [],
          movements: [],
          pendingMovements: [],
          candidates: [],
          links: [],
        }),
      )
      .mockResolvedValueOnce(response(operation))
      .mockResolvedValueOnce(
        response({
          operations: [operation],
          movements: [],
          pendingMovements: [],
          candidates: [],
          links: [],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<ManualPortfolioOperations />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Registrar operação" }),
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Operação" }));
    fireEvent.click(await screen.findByRole("option", { name: "Venda" }));
    fireEvent.change(screen.getByLabelText("Data efetiva"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Ativo ou produto"), {
      target: { value: "Empresa Exemplo" },
    });
    fireEvent.change(screen.getByLabelText("Código do ativo (opcional)"), {
      target: { value: "EXMP3" },
    });
    fireEvent.change(screen.getByLabelText("Quantidade"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Preço unitário"), {
      target: { value: "10.25" },
    });
    fireEvent.change(screen.getByLabelText("Moeda (código ISO)"), {
      target: { value: "USD" },
    });
    fireEvent.change(
      screen.getByLabelText("Taxas (opcional, na mesma moeda)"),
      {
        target: { value: "1.2" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar operação" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch.mock.calls[1]![0]).toBe("/api/portfolio/operations");
    expect(fetch.mock.calls[1]![1].headers).toMatchObject({
      "Idempotency-Key": expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    });
    expect(JSON.parse(fetch.mock.calls[1]![1].body as string)).toMatchObject({
      side: "SELL",
      effectiveDate: "2026-10-01",
      assetCode: "EXMP3",
      currency: "USD",
      quantity: "2",
      fees: "1.2",
    });
    expect(toast.success).toHaveBeenCalledWith("Operação manual registrada.");
    fireEvent.click(screen.getByRole("button", { name: "Registrar operação" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancelar",
      }),
    );
  });

  it("retries an ambiguous create with the same idempotency key and payload", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          operations: [],
          movements: [],
          pendingMovements: [],
          candidates: [],
          links: [],
        }),
      )
      .mockRejectedValueOnce(new Error("connection lost after commit"))
      .mockResolvedValueOnce(response(operation))
      .mockResolvedValueOnce(
        response({
          operations: [operation],
          movements: [],
          pendingMovements: [],
          candidates: [],
          links: [],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<ManualPortfolioOperations />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Registrar operação" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar operação" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar a operação manual.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar operação" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(fetch.mock.calls[1]![1].headers["Idempotency-Key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(fetch.mock.calls[2]![1].headers["Idempotency-Key"]).toBe(
      fetch.mock.calls[1]![1].headers["Idempotency-Key"],
    );
    expect(fetch.mock.calls[2]![1].body).toBe(fetch.mock.calls[1]![1].body);
    expect(toast.success).toHaveBeenCalledWith("Operação manual registrada.");
  });

  it("allows undo with an audit event while keeping source rows", async () => {
    const linked = { operationId: operation.id, movementId: movement.id };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          operations: [operation],
          movements: [movement],
          pendingMovements: [],
          candidates: [],
          links: [linked],
        }),
      )
      .mockResolvedValueOnce(response({ id: "event-2" }))
      .mockResolvedValueOnce(
        response({
          operations: [operation],
          movements: [movement],
          pendingMovements: [movement],
          candidates: [candidate],
          links: [],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<ManualPortfolioOperations />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Desfazer vínculo" }),
    );
    const confirmDialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "Cancelar" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Desfazer vínculo" }));
    const reopenedDialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(reopenedDialog).getByRole("button", { name: "Desfazer vínculo" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetch.mock.calls[1]![1].body as string)).toEqual({
      ...linked,
      action: "UNLINK",
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Vínculo desfeito; a operação e a movimentação foram preservadas.",
    );
  });

  it("shows a safe inline load error and retries successfully without a toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ message: "Falha client-safe." }, false),
        )
        .mockResolvedValueOnce(
          response({
            operations: [operation],
            movements: [],
            pendingMovements: [],
            candidates: [],
            links: [],
          }),
        ),
    );
    render(<ManualPortfolioOperations />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Falha client-safe.",
    );
    expect(
      screen.queryByText("Nenhuma compra ou venda manual registrada."),
    ).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Empresa Exemplo")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      within(
        screen.getByRole("button", { name: "Registrar operação" }),
      ).getByText("Registrar operação"),
    ).toBeTruthy();
  });

  it("uses an inline safe fallback when loading fails without a client-safe message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private detail")),
    );
    render(<ManualPortfolioOperations />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar as operações manuais.",
    );
    expect(
      screen.queryByText("Nenhuma compra ou venda manual registrada."),
    ).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalledWith("private detail");
  });

  it("preserves previously loaded operations when refresh fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            operations: [operation],
            movements: [],
            pendingMovements: [],
            candidates: [],
            links: [],
          }),
        )
        .mockResolvedValueOnce(
          response({ message: "Falha ao atualizar." }, false),
        ),
    );
    render(<ManualPortfolioOperations />);
    expect(await screen.findByText("Empresa Exemplo")).toBeTruthy();
    window.dispatchEvent(new Event("portfolio:updated"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Falha ao atualizar.",
    );
    expect(screen.getByText("Empresa Exemplo")).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("ignores a load failure after the component unmounts", async () => {
    let rejectLoad!: (reason: Error) => void;
    const pendingLoad = new Promise<Response>((_, reject) => {
      rejectLoad = reject;
    });
    const fetch = vi.fn().mockReturnValue(pendingLoad);
    vi.stubGlobal("fetch", fetch);
    const view = render(<ManualPortfolioOperations />);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    view.unmount();
    await act(async () => {
      rejectLoad(new Error("private detail"));
      await pendingLoad.catch(() => undefined);
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports safe and fallback errors when creating an operation", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          operations: [],
          movements: [],
          pendingMovements: [],
          candidates: [],
          links: [],
        }),
      )
      .mockResolvedValueOnce(
        response({ message: "Não foi possível salvar." }, false),
      )
      .mockRejectedValueOnce(new Error("private network detail"));
    vi.stubGlobal("fetch", fetch);
    render(<ManualPortfolioOperations />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Registrar operação" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar operação" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Não foi possível salvar."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar operação" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar a operação manual.",
      ),
    );
    expect(toast.error).not.toHaveBeenCalledWith("private network detail");
  });

  it("reports reconciliation failures and keeps B3 values without currency", async () => {
    const unmatchedMovement = {
      ...movement,
      unitPrice: null,
      operationValue: null,
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          operations: [operation],
          movements: [unmatchedMovement],
          pendingMovements: [
            unmatchedMovement,
            { ...unmatchedMovement, id: "movement-2" },
          ],
          candidates: [{ ...candidate, movement: unmatchedMovement }],
          links: [],
        }),
      )
      .mockResolvedValueOnce(response({ message: "O vínculo mudou." }, false))
      .mockRejectedValueOnce(new Error("private network detail"));
    vi.stubGlobal("fetch", fetch);
    render(<ManualPortfolioOperations />);

    expect(
      await screen.findByText(/Preço unitário B3: Não informado/),
    ).toBeTruthy();
    expect(screen.getByText(/2 movimentações B3 continuam/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Revisar e confirmar" }),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    fireEvent.click(
      screen.getByRole("button", { name: "Revisar e confirmar" }),
    );
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Confirmar vínculo" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("O vínculo mudou."),
    );
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Confirmar vínculo" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível atualizar a conciliação.",
      ),
    );
    expect(toast.error).not.toHaveBeenCalledWith("private network detail");
  });

  it("shows stale links and closes the unlink dialog with Escape", async () => {
    const staleOperation = {
      ...operation,
      side: "SELL",
      assetCode: null,
      fees: "0.5",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        response({
          operations: [staleOperation],
          movements: [],
          pendingMovements: [movement, { ...movement, id: "movement-2" }],
          candidates: [],
          links: [{ operationId: operation.id, movementId: "deleted-source" }],
        }),
      ),
    );
    render(<ManualPortfolioOperations />);
    expect(await screen.findByText("Venda")).toBeTruthy();
    expect(screen.getByText(/2 movimentações B3 continuam/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desfazer vínculo" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("ignores a pending refresh after the component unmounts", async () => {
    let resolveResponse:
      ((value: ReturnType<typeof response>) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveResponse = resolve;
          }),
      ),
    );
    const { unmount } = render(<ManualPortfolioOperations />);
    unmount();
    await act(async () => {
      resolveResponse?.(
        response({
          operations: [],
          movements: [],
          pendingMovements: [],
          candidates: [],
          links: [],
        }),
      );
    });
  });
});
