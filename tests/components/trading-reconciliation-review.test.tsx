// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import {
  TradingReconciliationReview,
  type B3ReconciliationSummary,
  type ReconciliationPair,
} from "@/components/trading-reconciliation-review";

const trade = {
  sourceRow: 7,
  date: "2026-10-14",
  side: "BUY" as const,
  ticker: "ABCD3",
  originalTicker: "ABCD3F",
  product: "Ação ordinária",
  institution: "Corretora A",
  quantity: "10",
  unitPrice: "12.5",
  value: "125",
};
const movement = {
  sourceRow: 8,
  date: "2026-10-14",
  direction: "Crédito",
  movementType: "Transferência - Liquidação",
  ticker: "ABCD3",
  product: "Ação ordinária",
  institution: "Corretora A",
  quantity: "10",
  unitPrice: "12.5",
  value: "125",
};
const pair = (movementId: string): ReconciliationPair => ({
  tradeId: "trade-id-private",
  movementId,
  trade,
  movement,
});
const summary = (
  pairs: ReconciliationPair[] = [pair("movement-id-private")],
): B3ReconciliationSummary => ({
  candidates: pairs.length === 1 ? pairs : [],
  confirmed: [],
  ambiguous:
    pairs.length > 1
      ? [
          {
            tradeId: pairs[0].tradeId,
            movementIds: pairs.map(({ movementId }) => movementId),
            pairs,
            status: "ambiguous",
          },
        ]
      : [],
  separated: [],
  unmatched: [],
  duplicateCandidates: [],
  movementDuplicateCandidates: [],
  history: {
    complete: false,
    reasons: ["Período de origem parcial."],
  },
});

describe("TradingReconciliationReview", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("requires a decision and keeps a candidate separate when selected", async () => {
    const onSummaryChange = vi.fn();
    const updated = summary([]);
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...updated, message: "Revisão salva." }),
    });
    vi.stubGlobal("fetch", fetch);
    render(
      <TradingReconciliationReview
        summary={summary()}
        onSummaryChange={onSummaryChange}
      />,
    );

    const save = screen.getByRole("button", {
      name: "Salvar decisões de conciliação",
    });
    expect(save).toHaveProperty("disabled", true);
    expect(screen.getByText(/Compra de ABCD3 em/)).toBeTruthy();
    expect(screen.getByText(/Histórico parcial/)).toBeTruthy();
    expect(screen.queryByText(/private/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Manter sem vínculo" }));
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(save);

    await waitFor(() => expect(onSummaryChange).toHaveBeenCalledOnce());
    const request = fetch.mock.calls[0][1];
    expect(request.url ?? fetch.mock.calls[0][0]).toBe(
      "/api/imports/reconciliation",
    );
    expect(JSON.parse(request.body)).toEqual({
      decisions: [
        {
          tradeId: "trade-id-private",
          movementId: "movement-id-private",
          action: "KEEP_SEPARATE",
        },
      ],
    });
    expect(toast.success).toHaveBeenCalledWith("Revisão salva.");
  });

  it("links only the selected movement when a negotiation has ambiguous candidates", async () => {
    const firstPair = pair("movement-one");
    const secondPair = pair("movement-two");
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...summary([]), message: "Atualizado." }),
    });
    vi.stubGlobal("fetch", fetch);
    render(
      <TradingReconciliationReview
        summary={summary([firstPair, secondPair])}
        onSummaryChange={vi.fn()}
      />,
    );

    const choices = screen.getAllByRole("button", {
      name: /Vincular a: Transferência/,
    });
    expect(choices).toHaveLength(2);
    fireEvent.click(choices[1]);
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar decisões de conciliação" }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      decisions: [
        {
          tradeId: "trade-id-private",
          movementId: "movement-one",
          action: "KEEP_SEPARATE",
        },
        {
          tradeId: "trade-id-private",
          movementId: "movement-two",
          action: "LINK",
        },
      ],
    });
  });

  it("shows an empty review when there are no candidates or confirmed links", () => {
    render(
      <TradingReconciliationReview
        summary={summary([])}
        onSummaryChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Não há correspondências para revisar/),
    ).toBeTruthy();
  });

  it("uses product fallbacks for sales whose optional market values are absent", () => {
    const sparsePair: ReconciliationPair = {
      ...pair("movement-sparse"),
      trade: {
        ...trade,
        side: "SELL",
        ticker: null,
        value: null,
        institution: null,
      },
      movement: {
        ...movement,
        ticker: null,
        product: "Produto informado",
        value: null,
      },
    };
    render(
      <TradingReconciliationReview
        summary={summary([sparsePair])}
        onSummaryChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Venda de Ação ordinária em/)).toBeTruthy();
    expect(
      screen.getByText(/Transferência - Liquidação.*Produto informado/),
    ).toBeTruthy();
    expect(screen.getAllByText(/valor não informado/)).toHaveLength(2);
    expect(screen.getByText(/instituição não informada/)).toBeTruthy();
  });

  it("avoids showing the same pair twice if it appears in multiple summary groups", () => {
    const candidate = pair("movement-repeated");
    const base = summary([candidate]);
    const duplicateSummary: B3ReconciliationSummary = {
      ...base,
      ambiguous: [
        {
          tradeId: candidate.tradeId,
          movementIds: [candidate.movementId],
          pairs: [candidate],
          status: "ambiguous",
        },
      ],
    };

    render(
      <TradingReconciliationReview
        summary={duplicateSummary}
        onSummaryChange={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: /Vincular a: Transferência/ }),
    ).toHaveLength(1);
  });

  it("labels duplicate occurrences from the movement document separately", () => {
    const movementDuplicateSummary: B3ReconciliationSummary = {
      ...summary([]),
      movementDuplicateCandidates: [
        {
          occurrenceCount: 2,
          sourceRows: [4, 8],
          importCount: 2,
          status: "ambiguous",
        },
      ],
    };

    render(
      <TradingReconciliationReview
        summary={movementDuplicateSummary}
        onSummaryChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Movimentação: linhas 4, 8/)).toBeTruthy();
  });

  it("shows a safe error and keeps the review when the decision is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Não autorizado." }),
      }),
    );
    render(
      <TradingReconciliationReview
        summary={summary()}
        onSummaryChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manter sem vínculo" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar decisões de conciliação" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Não autorizado."),
    );
    expect(screen.getByText(/Compra de ABCD3 em/)).toBeTruthy();
  });

  it("reports a safe fallback if the request fails before returning a response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("network unavailable"));
    render(
      <TradingReconciliationReview
        summary={summary()}
        onSummaryChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manter sem vínculo" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar decisões de conciliação" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível comunicar com o servidor.",
      ),
    );
  });
});
