// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioObjectiveOrganizer } from "@/app/portfolio/_components/portfolio-objective-organizer";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const objectives = [
  { id: "reserve", name: "Reserva" },
  { id: "trip", name: "Viagem" },
];

const preview = {
  valuationDate: "2026-10-01",
  effectiveValuationDates: ["2026-09-30"],
  optimal: true,
  exploredStates: 20,
  stateLimit: 1000,
  canConfirm: true,
  allocation: { positionA: "reserve", positionB: "trip", positionC: null },
  expectedOwners: { positionA: null, positionB: "reserve", positionC: null },
  expectedValueCents: {
    positionA: "99999",
    positionB: "50001",
    positionC: "2500",
  },
  expectedValuationDates: {
    positionA: "2026-09-30",
    positionB: "2026-09-30",
    positionC: null,
  },
  expectedSourceFingerprint: "a".repeat(64),
  objectives: [
    {
      objectiveId: "reserve",
      name: "Reserva",
      observedBalanceCents: "100000",
      proposedValueCents: "99999",
      differenceCents: "-1",
      assetKeys: ["positionA"],
    },
    {
      objectiveId: "trip",
      name: "Viagem",
      observedBalanceCents: "50000",
      proposedValueCents: "50001",
      differenceCents: "1",
      assetKeys: ["positionB"],
    },
  ],
  transfers: [
    {
      assetKey: "positionB",
      product: "CDB Banco A",
      assetCode: "CDB-123",
      maturityAt: "2028-01-01",
      fromObjectiveId: "reserve",
      fromObjectiveName: "Reserva",
      toObjectiveId: "trip",
      toObjectiveName: "Viagem",
      valueCents: "50001",
    },
  ],
  unassignedPositions: [
    { assetKey: "positionC", product: "CDB sem destino", valueCents: "2500" },
  ],
  unassignmentTransfers: [],
  preservedPositions: [],
  limitations: ["Uma posição usa uma avaliação CDI parcial."],
};

const references = [
  {
    objectiveId: "reserve",
    amountCents: "100000",
    observedDate: "2026-09-30",
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

function response(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

function renderOrganizer(
  props: Partial<React.ComponentProps<typeof PortfolioObjectiveOrganizer>> = {},
) {
  return render(
    <PortfolioObjectiveOrganizer
      objectives={objectives}
      onCancel={vi.fn()}
      onCompleted={vi.fn()}
      {...props}
    />,
  );
}

async function enterBalances(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Reserva"), "100000");
  await user.type(screen.getByLabelText("Viagem"), "50000");
}

describe("PortfolioObjectiveOrganizer", () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
    fetchMock = vi.fn().mockResolvedValue(response(preview));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("dispatchEvent", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows dated bank references separately and leaves every current balance blank", () => {
    renderOrganizer({ balanceReferences: references });
    expect((screen.getByLabelText("Reserva") as HTMLInputElement).value).toBe(
      "",
    );
    expect((screen.getByLabelText("Viagem") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      screen.getByText("Última referência: R$ 1.000,00 em 30/09/2026"),
    ).toBeTruthy();
    expect(
      (
        screen.getByLabelText(
          "Data comum da consulta ao banco",
        ) as HTMLInputElement
      ).value,
    ).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(
      screen.getByText(/não comprova quais notas formam cada saldo/),
    ).toBeTruthy();
  });

  it("keeps a cleared balance blank", () => {
    renderOrganizer();
    fireEvent.change(screen.getByLabelText("Reserva"), {
      target: { value: " " },
    });
    expect((screen.getByLabelText("Reserva") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("requires at least one observed balance without calling the API", async () => {
    const user = userEvent.setup();
    renderOrganizer();
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Informe o saldo observado de pelo menos um objetivo.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a future query date inline", async () => {
    const user = userEvent.setup();
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    const date = screen.getByLabelText("Data comum da consulta ao banco");
    fireEvent.change(date, { target: { value: "31/12/2999" } });
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "A data da consulta não pode estar no futuro.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the common date", async () => {
    const user = userEvent.setup();
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    fireEvent.change(screen.getByLabelText("Data comum da consulta ao banco"), {
      target: { value: "" },
    });
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Informe a data comum da consulta ao banco.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects amounts too large to convert safely to cents", async () => {
    const user = userEvent.setup();
    renderOrganizer();
    fireEvent.change(screen.getByLabelText("Reserva"), {
      target: { value: "9".repeat(400) },
    });
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Reserva: Informe um saldo válido em reais.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects finite balances whose cents exceed the safe integer range", async () => {
    const user = userEvent.setup();
    renderOrganizer();
    fireEvent.change(screen.getByLabelText("Reserva"), {
      target: { value: "9007199254740992" },
    });
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Reserva: Informe um saldo válido em reais.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an explicit zero balance in the requested targets", async () => {
    const user = userEvent.setup();
    renderOrganizer();
    fireEvent.change(screen.getByLabelText("Reserva"), {
      target: { value: "0" },
    });
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Revise a distribuição");
    expect(
      JSON.parse(String(fetchMock.mock.calls[0][1].body)).balances,
    ).toEqual([{ objectiveId: "reserve", amount: 0 }]);
  });

  it("formats a nonzero balance as Brazilian currency while editing", () => {
    renderOrganizer();
    fireEvent.change(screen.getByLabelText("Reserva"), {
      target: { value: "123" },
    });
    expect((screen.getByLabelText("Reserva") as HTMLInputElement).value).toBe(
      "R$ 1,23",
    );
  });

  it("renders newly added objective inputs as blank", () => {
    const user = userEvent.setup();
    const result = renderOrganizer();
    result.rerender(
      <PortfolioObjectiveOrganizer
        objectives={[...objectives, { id: "home", name: "Casa" }]}
        onCancel={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("Casa") as HTMLInputElement).value).toBe("");
    return user
      .click(screen.getByRole("button", { name: "Buscar distribuição" }))
      .then(() => {
        expect(fetchMock).not.toHaveBeenCalled();
      });
  });

  it("sends one common date and the entered balances to preview", async () => {
    const user = userEvent.setup();
    renderOrganizer();
    await enterBalances(user);
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
    expect(await screen.findByText("Revise a distribuição")).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/portfolio/objectives/allocation/preview");
    expect(JSON.parse(String(init.body))).toMatchObject({
      valuationDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      balances: [
        { objectiveId: "reserve", amount: 1000 },
        { objectiveId: "trip", amount: 500 },
      ],
    });
    expect(
      screen.getByText(/Valores efetivamente disponíveis até 30\/09\/2026/),
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Saldo informado" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Total proposto" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Diferença" }),
    ).toBeTruthy();
    expect(screen.getByText("Busca concluída")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Reserva" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Viagem" })).toBeTruthy();
    expect(screen.getByText(/Reserva → Viagem/)).toBeTruthy();
    expect(screen.getByText("CDB sem destino")).toBeTruthy();
    expect(
      screen.getByText("Uma posição usa uma avaliação CDI parcial."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Confirmar distribuição" }),
    ).toBeTruthy();
  });

  it("confirms the reviewed allocation once and refreshes portfolio state", async () => {
    const user = userEvent.setup();
    const onCompleted = vi.fn();
    fetchMock
      .mockResolvedValueOnce(response(preview))
      .mockResolvedValueOnce(response({ message: "Distribuição salva." }));
    renderOrganizer({ onCompleted });
    await enterBalances(user);
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Revise a distribuição");
    await user.click(
      screen.getByRole("button", { name: "Confirmar distribuição" }),
    );
    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/portfolio/objectives/allocation/confirm",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toMatchObject({
      allocation: preview.allocation,
      expectedOwners: preview.expectedOwners,
      expectedValueCents: preview.expectedValueCents,
      expectedValuationDates: preview.expectedValuationDates,
      expectedSourceFingerprint: preview.expectedSourceFingerprint,
      balances: [
        { objectiveId: "reserve", amount: 1000 },
        { objectiveId: "trip", amount: 500 },
      ],
    });
    expect(toast.success).toHaveBeenCalledWith("Distribuição salva.");
  });

  it("requires explicit review before confirming a partial result", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      response({
        ...preview,
        optimal: false,
        canConfirm: true,
        transfers: preview.transfers.map((transfer) => ({
          ...transfer,
          assetCode: null,
          maturityAt: null,
        })),
        unassignmentTransfers: [
          {
            assetKey: "owned-position-c",
            product: "CDB Banco B",
            assetCode: null,
            maturityAt: null,
            fromObjectiveId: "trip",
            fromObjectiveName: "Viagem",
            valueCents: "2500",
          },
          {
            assetKey: "owned-position-d",
            product: "CDB Banco C",
            assetCode: "CDB-789",
            maturityAt: "2029-02-01",
            fromObjectiveId: "trip",
            fromObjectiveName: "Viagem",
            valueCents: "3500",
          },
        ],
      }),
    );
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Busca parcial" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Revisar confirmação parcial" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/a confirmação exige sua autorização explícita/i),
    ).toBeTruthy();
    expect(screen.getByText("CDB Banco A")).toBeTruthy();
    expect(screen.getByText(/Código não informado/)).toBeTruthy();
    expect(screen.getByText(/vencimento não informado/)).toBeTruthy();
    expect(screen.queryByText("positionB")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Revisar confirmação parcial" }),
    );
    const partialDialog = await screen.findByRole("alertdialog", {
      name: "Aplicar esta candidata parcial?",
    });
    expect(screen.getByText("Transferências autorizadas")).toBeTruthy();
    expect(within(partialDialog).getByText(/diferença -R\$ 0,01/)).toBeTruthy();
    expect(
      within(partialDialog).getByText("Posições que ficarão sem objetivo"),
    ).toBeTruthy();
    expect(
      within(partialDialog).getAllByText(/Viagem → Sem objetivo/),
    ).toBeTruthy();
    expect(
      within(partialDialog).getByText(/vence em 01\/02\/2029/),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Voltar e revisar" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends explicit consent when confirming the reviewed partial candidate", async () => {
    const user = userEvent.setup();
    const onCompleted = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        response({ ...preview, optimal: false, canConfirm: true }),
      )
      .mockResolvedValueOnce(response({ message: "Distribuição salva." }));
    renderOrganizer({ onCompleted });
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByRole("heading", { name: "Busca parcial" });
    await user.click(
      screen.getByRole("button", { name: "Revisar confirmação parcial" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar candidata parcial" }),
    );
    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toMatchObject({
      acceptPartial: true,
      allocation: preview.allocation,
      expectedOwners: preview.expectedOwners,
      expectedValueCents: preview.expectedValueCents,
      expectedValuationDates: preview.expectedValuationDates,
      expectedSourceFingerprint: preview.expectedSourceFingerprint,
    });
  });

  it("shows when a partial candidate has no transfers", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      response({
        ...preview,
        optimal: false,
        canConfirm: true,
        transfers: [],
      }),
    );
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByRole("heading", { name: "Busca parcial" });
    await user.click(
      screen.getByRole("button", { name: "Revisar confirmação parcial" }),
    );
    expect(await screen.findByText("Nenhuma transferência")).toBeTruthy();
  });

  it("explains an optimal result that is not eligible for confirmation", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      response({ ...preview, canConfirm: false }),
    );
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    expect(
      await screen.findByText("Distribuição indisponível para confirmação"),
    ).toBeTruthy();
    expect(
      screen.getByText(/não pode ser confirmada\. Consulte as limitações/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Confirmar distribuição" }),
    ).toBeNull();
  });

  it("cancels a preview without sending a confirm request", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderOrganizer({ onCancel });
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Revise a distribuição");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/portfolio/objectives/allocation/preview",
    );
  });

  it("uses the safe backend message when preview is rejected", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      response({ message: "Saldo inválido." }, false),
    );
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Saldo inválido."),
    );
  });

  it("uses a friendly fallback when preview has no usable message", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(response({ message: " " }, false));
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível buscar uma distribuição.",
      ),
    );
  });

  it("uses a friendly fallback when the preview request fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new Error("private failure"));
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível buscar uma distribuição.",
      ),
    );
  });

  it("keeps a failed confirm in the review and shows its server message", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(response(preview))
      .mockResolvedValueOnce(
        response({ message: "As posições mudaram." }, false),
      );
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Revise a distribuição");
    await user.click(
      screen.getByRole("button", { name: "Confirmar distribuição" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("As posições mudaram."),
    );
    expect(
      screen.getByRole("button", { name: "Confirmar distribuição" }),
    ).toBeTruthy();
  });

  it("falls back to a safe message when confirm has no usable message", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(response(preview))
      .mockResolvedValueOnce(response({ message: " " }, false));
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Revise a distribuição");
    await user.click(
      screen.getByRole("button", { name: "Confirmar distribuição" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível confirmar a distribuição.",
      ),
    );
  });

  it("uses a friendly fallback when confirm cannot reach the server", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(response(preview))
      .mockRejectedValueOnce(new Error("private failure"));
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Revise a distribuição");
    await user.click(
      screen.getByRole("button", { name: "Confirmar distribuição" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível confirmar a distribuição.",
      ),
    );
  });

  it("uses the confirm fallback when the response has no message", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(response(preview))
      .mockResolvedValueOnce(response({}, false));
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Revise a distribuição");
    await user.click(
      screen.getByRole("button", { name: "Confirmar distribuição" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível confirmar a distribuição.",
      ),
    );
  });

  it("uses a friendly fallback when confirmation cannot reach the server", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(response(preview))
      .mockRejectedValueOnce(new Error("private failure"));
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Revise a distribuição");
    await user.click(
      screen.getByRole("button", { name: "Confirmar distribuição" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível confirmar a distribuição.",
      ),
    );
  });

  it("explains preserved positions, current owners, known values and valuation limitations", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      response({
        ...preview,
        preservedPositions: [
          {
            assetKey: "asset-trip",
            product: "CDB da viagem",
            ownerObjectiveId: "trip",
            ownerObjectiveName: "Viagem",
            valueCents: "12345",
            reasons: [{ code: "objective_balance_not_provided" }],
          },
          {
            assetKey: "asset-unvalued",
            product: "CDB sem avaliação",
            ownerObjectiveId: "reserve",
            ownerObjectiveName: "Reserva",
            valueCents: null,
            reasons: [
              {
                code: "value_unavailable",
                limitation: "Taxas CDI ainda indisponíveis.",
              },
              { code: "objective_balance_not_provided" },
            ],
          },
          {
            assetKey: "asset-free-unvalued",
            product: "CDB livre sem valor",
            ownerObjectiveId: null,
            ownerObjectiveName: null,
            valueCents: null,
            reasons: [{ code: "value_unavailable", limitation: null }],
          },
        ],
      }),
    );
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );

    expect(
      await screen.findByText("Posições preservadas fora da otimização"),
    ).toBeTruthy();
    expect(screen.getByText("asset-trip")).toBeTruthy();
    expect(screen.getByText("CDB da viagem")).toBeTruthy();
    expect(screen.getByText("Objetivo atual: Viagem")).toBeTruthy();
    expect(screen.getByText("Valor canônico: R$ 123,45")).toBeTruthy();
    expect(screen.getByText("Objetivo atual: Reserva")).toBeTruthy();
    expect(screen.getAllByText("Valor não disponível")).toHaveLength(2);
    expect(screen.getByText("CDB livre sem valor")).toBeTruthy();
    expect(screen.getByText("Sem objetivo atual")).toBeTruthy();
    expect(screen.getByText(/Taxas CDI ainda indisponíveis\./)).toBeTruthy();
    expect(
      screen.getAllByText(
        /O saldo de referência desse objetivo não foi informado/,
      ),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(
        /Fora da otimização porque o valor não está disponível\./,
      ),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Confirmar distribuição" }),
    ).toBeTruthy();
  });

  it("keeps a preserved position visible without enabling a partial result", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      response({
        ...preview,
        optimal: false,
        canConfirm: false,
        preservedPositions: [
          {
            assetKey: "unvalued-trip",
            product: "CDB preservado",
            ownerObjectiveId: "trip",
            ownerObjectiveName: "Viagem",
            valueCents: null,
            reasons: [
              {
                code: "value_unavailable",
                limitation: "Valor canônico indisponível.",
              },
            ],
          },
        ],
      }),
    );
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Posições preservadas fora da otimização");
    expect(
      screen.queryByRole("button", { name: "Confirmar distribuição" }),
    ).toBeNull();
  });

  it("does not render transfer or limitation sections when they are empty", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      response({
        ...preview,
        effectiveValuationDates: [],
        transfers: [],
        limitations: [],
        unassignedPositions: [],
      }),
    );
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Revise a distribuição");
    expect(
      screen.queryByRole("heading", {
        name: "Posições que serão transferidas",
      }),
    ).toBeNull();
    expect(screen.getByText(/Todas as posições elegíveis/)).toBeTruthy();
    expect(
      screen.queryByText(/Valores efetivamente disponíveis até/),
    ).toBeNull();
  });

  it("supports a preview response without preserved positions", async () => {
    const user = userEvent.setup();
    const responseBody: Record<string, unknown> = { ...preview };
    delete responseBody.preservedPositions;
    fetchMock.mockResolvedValueOnce(response(responseBody));
    renderOrganizer();
    await user.type(screen.getByLabelText("Reserva"), "10000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Revise a distribuição");
    expect(
      screen.queryByText("Posições preservadas fora da otimização"),
    ).toBeNull();
  });
});
