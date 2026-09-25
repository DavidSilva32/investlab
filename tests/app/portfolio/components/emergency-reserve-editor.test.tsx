// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { EmergencyReserveEditor } from "@/app/portfolio/_components/emergency-reserve-editor";

const keyA = `v1:${"a".repeat(64)}`;
const keyB = `v1:${"b".repeat(64)}`;
const editorData = {
  monthlyExpenses: 2000,
  targetMonths: 6,
  selectedAssetKeys: [keyA],
  configured: true,
  selectedPositionCount: 1,
  missingSelectionCount: 0,
  calculation: {
    monthlyExpenses: 2000,
    targetMonths: 6,
    selectedValue: 3000,
    selectedGroups: 1,
    unvaluedGroups: 0,
    referenceDate: "2026-09-01",
    targetValue: 12000,
    coveredMonths: 1.5,
    difference: 9000,
    progressPercentage: 25,
    status: "below_target" as const,
  },
  holdings: [
    {
      assetKey: keyA,
      product: "CDB liquidez",
      assetCode: "CDB1",
      institution: "Banco A",
      issuer: "Banco A",
      indexer: "DI",
      maturityAt: "2028-01-01",
      positionCount: 1,
      unvaluedPositions: 0,
      value: 3000,
      selected: true,
    },
    {
      assetKey: keyB,
      product: "Tesouro Selic",
      assetCode: null,
      institution: null,
      issuer: null,
      indexer: "Selic",
      maturityAt: "2029-01-01",
      positionCount: 2,
      unvaluedPositions: 1,
      value: null,
      selected: false,
    },
  ],
};

describe("EmergencyReserveEditor", () => {
  afterEach(() => {
    cleanup();
    toast.error.mockReset();
    toast.success.mockReset();
    vi.restoreAllMocks();
  });

  it("loads groups and saves the user's selection and personal target", async () => {
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () =>
        options?.method === "PUT"
          ? {
              ...editorData,
              monthlyExpenses: null,
              targetMonths: null,
              selectedAssetKeys: [keyA, keyB],
            }
          : editorData,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<EmergencyReserveEditor />);

    const first = await screen.findByLabelText(/CDB liquidez/);
    await user.click(first);
    await user.click(first);
    const second = await screen.findByLabelText(/Tesouro Selic/);
    await user.click(second);
    await user.click(
      screen.getByRole("button", { name: "Salvar configuração" }),
    );

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    const saveCall = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    );
    expect(JSON.parse(saveCall?.[1]?.body as string)).toEqual({
      monthlyExpenses: 2000,
      targetMonths: 6,
      selectedAssetKeys: [keyA, keyB],
    });
    expect(
      screen.getByText(/não confirma prazo ou condições de resgate/),
    ).toBeTruthy();
  });

  it("shows a validation message when the cost is invalid", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...editorData,
        monthlyExpenses: null,
        targetMonths: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmergencyReserveEditor />);

    await screen.findByLabelText("Custo mensal");
    fireEvent.change(screen.getByLabelText("Custo mensal"), {
      target: { value: "0" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Salvar configuração" })
        .closest("form")!,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Informe um custo mensal maior que zero e de até R$ 1.000.000.000.000,00.",
    );
  });

  it("enforces the same upper bound as the API for the month target", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => editorData,
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmergencyReserveEditor />);

    const monthInput = await screen.findByLabelText("Meta pessoal em meses");
    expect(monthInput.getAttribute("max")).toBe("1200");
    fireEvent.change(screen.getByLabelText("Meta pessoal em meses"), {
      target: { value: "1201" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Salvar configuração" })
        .closest("form")!,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Informe sua meta pessoal como um número inteiro de 1 a 1200 meses.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows removing unmatched selections before saving", async () => {
    const staleKey = "v1:" + "c".repeat(64);
    const initial = {
      ...editorData,
      selectedAssetKeys: [keyA, staleKey],
      missingSelectionCount: 1,
    };
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () => (options?.method === "PUT" ? editorData : initial),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    await screen.findByRole("status");
    await user.click(
      screen.getByRole("button", {
        name: "Remover grupos sem correspondência",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar configuração" }),
    );

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    const saveCall = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    );
    expect(JSON.parse(saveCall?.[1]?.body as string).selectedAssetKeys).toEqual(
      [keyA],
    );
  });

  it("shows the no-positions state and save errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...editorData, holdings: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "save failed" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    expect(
      await screen.findByText(/Importe uma posição da carteira/),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Salvar configuração" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível salvar a configuração. Tente novamente.",
    );
  });
  it("offers retry after the editor cannot load", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "load failed" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => editorData });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar a configuração da reserva.",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByLabelText(/Tesouro Selic/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
