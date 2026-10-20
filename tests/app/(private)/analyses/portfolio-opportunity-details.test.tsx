// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PortfolioOpportunityDetails,
  type PortfolioOpportunity,
} from "@/app/(private)/analyses/_components/portfolio-opportunity-details";

const opportunity: PortfolioOpportunity = {
  ticker: "PETR4",
  logoUrl: null,
  name: "Petrobras PN",
  quantity: 12,
  positionDate: "2026-09-30",
  price: 30,
  priceAsOf: "2026-10-01",
  fundamentalsAsOf: "2025-12-31",
  financialPeriods: [{ referenceDate: "2025-12-31", sourceDocument: "DFP" }],
  automaticDividend: {
    value: 5,
    windowStart: "2025-10-02",
    windowEnd: "2026-10-02",
    observedPayments: 3,
    source: "BRAPI",
    unavailableReason: null,
  },
  inputs: [],
  methods: {
    graham: {
      value: 42,
      differencePercent: 40,
      asOf: "2025-12-31",
      source: "Relatório anual",
      unavailableReason: null,
    },
    bazin: {
      value: 33,
      differencePercent: -10,
      asOf: "2025-12-31",
      source: null,
      unavailableReason: null,
    },
  },
};

afterEach(cleanup);

describe("PortfolioOpportunityDetails", () => {
  it("shows references inside an asset, reveals evidence and reports manual edits", async () => {
    const onUpdateDraft = vi.fn();
    const onSaveInput = vi.fn();
    render(
      <PortfolioOpportunityDetails
        opportunity={opportunity}
        drafts={{
          "PETR4:graham_eps": {
            value: "4",
            source: "Relatório anual",
            asOf: "",
          },
        }}
        saving={null}
        onUpdateDraft={onUpdateDraft}
        onSaveInput={onSaveInput}
      />,
    );

    expect(screen.getByText("PETR4 · Petrobras PN")).toBeTruthy();
    expect(screen.getByText("Número de Graham")).toBeTruthy();
    expect(screen.getByText("Preço-teto de Bazin")).toBeTruthy();
    expect(screen.getByText(/lados diferentes da cotação atual/i)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Ver fontes e limitações" }),
    ).toBeNull();
    expect(screen.queryByText(/DFP 31 de dez. de 2025/i)).toBeNull();
    expect(screen.queryByText(/BRAPI/i)).toBeNull();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    const value = screen.getByRole("spinbutton", {
      name: "Lucro por ação (LPA), valor",
    });
    fireEvent.change(value, { target: { value: "4.25" } });
    expect(onUpdateDraft).toHaveBeenCalledWith("graham_eps", "value", "4.25");
    fireEvent.change(
      screen.getByLabelText("Lucro por ação (LPA), data de referência"),
      { target: { value: "30/06/2025" } },
    );
    fireEvent.change(screen.getByLabelText("Lucro por ação (LPA), origem"), {
      target: { value: "Relações com investidores" },
    });
    expect(onUpdateDraft).toHaveBeenCalledWith(
      "graham_eps",
      "asOf",
      "2025-06-30",
    );
    expect(onUpdateDraft).toHaveBeenCalledWith(
      "graham_eps",
      "source",
      "Relações com investidores",
    );
    expect(screen.getByText(/Origem manual: Relatório anual/i)).toBeTruthy();
    const form = value.closest("form");
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    expect(onSaveInput).toHaveBeenCalledWith("graham_eps");
    expect(
      screen.getByRole("link", { name: "Ver critérios" }).getAttribute("href"),
    ).toBe("/analises?ticker=PETR4");
  });

  it("marks the matching manual input as saving", async () => {
    render(
      <PortfolioOpportunityDetails
        opportunity={opportunity}
        drafts={{
          "PETR4:graham_eps": {
            value: "4",
            source: "Relatório anual",
            asOf: "2025-12-31",
          },
        }}
        saving="PETR4:graham_eps"
        onUpdateDraft={vi.fn()}
        onSaveInput={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    const form = screen
      .getByRole("spinbutton", { name: "Lucro por ação (LPA), valor" })
      .closest("form");
    const saveButton = within(form!).getByRole("button", {
      name: "Salvando",
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("opens manual fields directly when completing missing data", () => {
    render(
      <PortfolioOpportunityDetails
        opportunity={{
          ...opportunity,
          methods: {
            graham: {
              value: null,
              differencePercent: null,
              asOf: null,
              source: null,
              unavailableReason: "Falta o LPA.",
            },
            bazin: {
              value: null,
              differencePercent: null,
              asOf: null,
              source: null,
              unavailableReason: "Faltam proventos.",
            },
          },
        }}
        openInputsInitially
        drafts={{
          "PETR4:graham_eps": {
            value: "4.25",
            source: "Relações com investidores",
            asOf: "2025-06-30",
          },
        }}
        saving={null}
        onUpdateDraft={vi.fn()}
        onSaveInput={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    ).toBeNull();
    expect(screen.queryByText("Número de Graham")).toBeNull();
    expect(screen.queryByText("Preço-teto de Bazin")).toBeNull();
    expect(screen.queryByText("Indisponível")).toBeNull();
    expect(
      (
        screen.getByRole("spinbutton", {
          name: "Lucro por ação (LPA), valor",
        }) as HTMLInputElement
      ).value,
    ).toBe("4.25");
    expect(
      screen.getByText(/Origem manual: Relações com investidores/),
    ).toBeTruthy();
    expect(screen.getByText(/2025-06-30/)).toBeTruthy();
    expect(
      screen.getByLabelText("Valor patrimonial por ação (VPA), valor"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Proventos por ação em 12 meses, origem"),
    ).toBeTruthy();
  });

  it("preserves calculated method and opens only the missing method input", () => {
    render(
      <PortfolioOpportunityDetails
        opportunity={{
          ...opportunity,
          methods: {
            ...opportunity.methods,
            bazin: {
              value: null,
              differencePercent: null,
              asOf: null,
              source: null,
              unavailableReason: "Faltam proventos.",
            },
          },
        }}
        openInputsInitially
        drafts={{}}
        saving={null}
        onUpdateDraft={vi.fn()}
        onSaveInput={vi.fn()}
      />,
    );

    expect(screen.getByText("Número de Graham")).toBeTruthy();
    expect(screen.getByText("R$ 42,00")).toBeTruthy();
    expect(screen.queryByText("Preço-teto de Bazin")).toBeNull();
    expect(screen.queryByText("Indisponível")).toBeNull();
    expect(screen.queryByLabelText("Lucro por ação (LPA), valor")).toBeNull();
    expect(
      screen.queryByLabelText("Valor patrimonial por ação (VPA), valor"),
    ).toBeNull();
    expect(
      screen.getByLabelText("Proventos por ação em 12 meses, valor"),
    ).toBeTruthy();
  });

  it("shows a zero difference and a supplied limitation for a calculated reference", () => {
    render(
      <PortfolioOpportunityDetails
        opportunity={{
          ...opportunity,
          positionDate: "data-inválida",
          methods: {
            ...opportunity.methods,
            graham: {
              ...opportunity.methods.graham,
              differencePercent: 0,
              unavailableReason: "Confira a referência informada.",
            },
            bazin: {
              ...opportunity.methods.bazin,
              differencePercent: 0,
            },
          },
        }}
        drafts={{}}
        saving={null}
        onUpdateDraft={vi.fn()}
        onSaveInput={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Na referência calculada")).toHaveLength(2);
    expect(screen.getByText("Confira a referência informada.")).toBeTruthy();
    expect(
      screen.getByText(/posição importada em Data não informada/),
    ).toBeTruthy();
  });

  it("labels a calculated reference without a date", () => {
    render(
      <PortfolioOpportunityDetails
        opportunity={{
          ...opportunity,
          methods: {
            ...opportunity.methods,
            graham: { ...opportunity.methods.graham, asOf: null },
          },
        }}
        drafts={{}}
        saving={null}
        onUpdateDraft={vi.fn()}
        onSaveInput={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Relatório anual · Data não informada/),
    ).toBeTruthy();
  });

  it("keeps missing references and inputs understandable", async () => {
    render(
      <PortfolioOpportunityDetails
        opportunity={{
          ...opportunity,
          ticker: "VALE3",
          logoUrl: null,
          price: null,
          priceAsOf: null,
          positionDate: "data-inválida",
          fundamentalsAsOf: null,
          financialPeriods: [],
          automaticDividend: null,
          methods: {
            graham: {
              value: null,
              differencePercent: null,
              asOf: null,
              source: null,
              unavailableReason: "Faltam dados do Graham.",
            },
            bazin: {
              value: null,
              differencePercent: null,
              asOf: null,
              source: null,
              unavailableReason: null,
            },
          },
        }}
        drafts={{}}
        saving={null}
        onUpdateDraft={vi.fn()}
        onSaveInput={vi.fn()}
      />,
    );

    expect(screen.getByText(/cotação indisponível/i)).toBeTruthy();
    expect(
      screen.getByText(/posição importada em Data não informada/i),
    ).toBeTruthy();
    expect(screen.queryByText(/Fundamentos:/i)).toBeNull();
    expect(screen.queryByText(/cobertura não confirmada/i)).toBeNull();
    expect(screen.getByText("Faltam dados do Graham.")).toBeTruthy();
    expect(screen.getAllByText("Indisponível")).toHaveLength(2);

    expect(
      screen.queryByRole("button", { name: "Ver fontes e limitações" }),
    ).toBeNull();
    expect(screen.getByText("Comparação indisponível")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    expect(
      screen.getByText(
        "Informe valor por ação, origem e data: LPA e VPA para Graham; proventos em 12 meses para Bazin.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByPlaceholderText("Valor")).toHaveLength(3);
  });
});
