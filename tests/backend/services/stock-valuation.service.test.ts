import {
  calculateStockValuation,
  discountedEnterpriseValue,
  StockValuationService,
} from "@/backend/services/stock-valuation.service";
import type { StockValuationRequest } from "@/backend/schemas/stock-valuation.schema";
import { describe, expect, it, vi } from "vitest";

const methods = {
  baseFcff: "FCFF informado como premissa; BRL anual",
  downsideGrowth: "Crescimento anual informado como premissa",
  baseGrowth: "Crescimento anual informado como premissa",
  upsideGrowth: "Crescimento anual informado como premissa",
  riskFreeRate: "Taxa-base explicitada pelo usuário",
  equityRiskPremium: "ERP explicitado pelo usuário",
  beta: "Estimativa setorial explicitada pelo usuário",
  preTaxCostOfDebt: "Custo da dívida explicitado pelo usuário",
  taxRate: "Alíquota explicitada pelo usuário",
  equityWeight: "Peso explicitado pelo usuário",
  debtWeight: "Peso explicitado pelo usuário",
  terminalGrowth: "Premissa de estado estável explicitada pelo usuário",
  terminalWacc: "WACC de estado estável explicitado pelo usuário",
} as const;

function request() {
  const values = {
    baseFcff: [100, "currency", "base"],
    downsideGrowth: [0.02, "percentage", "forecast:5"],
    baseGrowth: [0.04, "percentage", "forecast:5"],
    upsideGrowth: [0.06, "percentage", "forecast:5"],
    riskFreeRate: [0.04, "percentage", "forecast:5"],
    equityRiskPremium: [0.05, "percentage", "forecast:5"],
    beta: [1, "ratio", "forecast:5"],
    preTaxCostOfDebt: [0.08, "percentage", "forecast:5"],
    taxRate: [0.25, "percentage", "forecast:5"],
    equityWeight: [0.7, "percentage", "forecast:5"],
    debtWeight: [0.3, "percentage", "forecast:5"],
    terminalGrowth: [0.025, "percentage", "terminal"],
    terminalWacc: [0.08, "percentage", "terminal"],
  } as const;
  return {
    forecastYears: 5,
    continuityConfirmed: true,
    countryRiskOverlapReviewed: true,
    inputs: Object.fromEntries(
      Object.entries(values).map(([key, [value, unit, horizon]]) => [
        key,
        {
          value,
          unit,
          horizon,
          type: "premise",
          source: "Premissas do usuário",
          asOf: "2026-09-28",
          currency: "BRL",
          basis: "nominal",
          method: methods[key as keyof typeof methods],
          version: "user-premise-v1",
        },
      ]),
    ),
  } as StockValuationRequest;
}

const operatingContext = {
  sector: "non_financial" as const,
  shareGateComplete: false,
};

describe("calculateStockValuation", () => {
  it("calculates nominal BRL WACC, three FCFF scenarios, and reproducible sensitivity", () => {
    const result = calculateStockValuation(request(), operatingContext);
    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") return;
    expect(result.wacc).toBeCloseTo(0.081);
    expect(result.scenarios.map(({ key }) => key)).toEqual([
      "downside",
      "base",
      "upside",
    ]);
    expect(result.scenarios[0]!.enterpriseValue).toBeLessThan(
      result.scenarios[1]!.enterpriseValue!,
    );
    expect(result.scenarios[1]!.enterpriseValue).toBeLessThan(
      result.scenarios[2]!.enterpriseValue!,
    );
    expect(result.sensitivity).toHaveLength(27);
    expect(result.valuationMethodVersion).toBe("fcff-dcf-brl-nominal-v1");
    expect(result.provenance.baseFcff?.source).toBe("Premissas do usuário");
    const sensitivityCenter = result.sensitivity[13]!;
    const lowerForecastWacc = result.sensitivity[4]!;
    const lowerTerminalWacc = result.sensitivity[10]!;
    const higherTerminalGrowth = result.sensitivity[14]!;
    expect(lowerForecastWacc.enterpriseValue).toBeGreaterThan(
      sensitivityCenter.enterpriseValue!,
    );
    expect(lowerTerminalWacc.enterpriseValue).toBeGreaterThan(
      sensitivityCenter.enterpriseValue!,
    );
    expect(higherTerminalGrowth.enterpriseValue).toBeGreaterThan(
      sensitivityCenter.enterpriseValue!,
    );
    expect(result.equityValue).toBeNull();
    expect(result.valuePerShare).toBeNull();
  });

  it("rejects non-finite operands at the discounted cash flow calculation boundary", () => {
    expect(
      discountedEnterpriseValue(Number.NaN, 0.04, 0.081, 0.08, 0.025, 5),
    ).toBeNull();
  });

  it.each([
    [1e308, 0, 0, 0.5, 0.1, 2],
    [1e308, 0, 0, 0.500000001, 0.5, 1],
    [4e307, 0, 0, 0.4, 0, 2],
  ])("rejects discounted value overflow (%s)", (...values) => {
    expect(
      discountedEnterpriseValue(
        ...(values as [number, number, number, number, number, number]),
      ),
    ).toBeNull();
  });

  it("returns explained unavailability when a required FCFF input is missing", () => {
    const input = request();
    input.inputs.baseFcff = null;
    input.inputs.downsideGrowth = null;
    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("unavailable");
    expect(result.reasons).toContain(
      "Informe o componente essencial: FCFF de referência.",
    );
    expect(result.reasons).toContain(
      "Informe o componente essencial: Crescimento do cenário conservador.",
    );
  });

  it("requires explicit forecast horizon and complete compatible input lineage", () => {
    const missingHorizon = request();
    missingHorizon.forecastYears = null;
    const horizonResult = calculateStockValuation(
      missingHorizon,
      operatingContext,
    );
    expect(horizonResult.status).toBe("unavailable");
    expect(horizonResult.reasons).toContain(
      "Selecione um horizonte explícito para o fluxo de caixa.",
    );

    const invalidLineage = request();
    invalidLineage.inputs.beta!.type = null;
    invalidLineage.inputs.beta!.asOf = "not-a-date";
    invalidLineage.inputs.beta!.currency = "USD";
    invalidLineage.inputs.beta!.basis = "real";
    invalidLineage.inputs.beta!.method = " ";
    invalidLineage.inputs.beta!.version = " ";
    const result = calculateStockValuation(invalidLineage, operatingContext);
    expect(result.status).toBe("unavailable");
    expect(result.reasons).toContain(
      "Beta precisa classificar o tipo de entrada.",
    );
    expect(result.reasons).toContain(
      "Beta precisa informar uma data-base válida.",
    );
    expect(result.reasons).toContain("Beta precisa estar em BRL nesta versão.");
    expect(result.reasons).toContain(
      "Beta precisa estar em base nominal nesta versão.",
    );
    expect(result.reasons).toContain("Beta precisa documentar o método.");
    expect(result.reasons).toContain(
      "Beta precisa informar a versão da premissa.",
    );
  });

  it("requires the selected risk-free maturity to match the DCF horizon", () => {
    const mismatched = request();
    mismatched.forecastYears = 10;
    for (const key of [
      "downsideGrowth",
      "baseGrowth",
      "upsideGrowth",
      "equityRiskPremium",
      "beta",
      "preTaxCostOfDebt",
      "taxRate",
      "equityWeight",
      "debtWeight",
    ] as const) {
      mismatched.inputs[key]!.horizon = "forecast:10";
    }
    mismatched.inputs.riskFreeRate!.horizon = "forecast:5";
    const mismatchResult = calculateStockValuation(
      mismatched,
      operatingContext,
    );
    expect(mismatchResult.status).toBe("unavailable");
    expect(mismatchResult.reasons).toContain(
      "O prazo/vértice da taxa-base precisa ser informado e coincidir com o horizonte do DCF.",
    );

    const maturityMissing = request();
    maturityMissing.inputs.riskFreeRate!.horizon = "forecast:unspecified";
    const missingResult = calculateStockValuation(
      maturityMissing,
      operatingContext,
    );
    expect(missingResult.status).toBe("unavailable");
    expect(missingResult.reasons).toContain(
      "O prazo/vértice da taxa-base precisa ser informado e coincidir com o horizonte do DCF.",
    );

    const matched = request();
    matched.forecastYears = 10;
    for (const key of [
      "downsideGrowth",
      "baseGrowth",
      "upsideGrowth",
      "riskFreeRate",
      "equityRiskPremium",
      "beta",
      "preTaxCostOfDebt",
      "taxRate",
      "equityWeight",
      "debtWeight",
    ] as const) {
      matched.inputs[key]!.horizon = "forecast:10";
    }
    expect(calculateStockValuation(matched, operatingContext).status).toBe(
      "calculated",
    );
  });

  it("rejects capital weights, tax rate, debt cost, and base rate outside their ranges", () => {
    const input = request();
    input.inputs.equityWeight!.value = 1.2;
    input.inputs.debtWeight!.value = -0.2;
    input.inputs.taxRate!.value = 1.2;
    input.inputs.preTaxCostOfDebt!.value = -0.01;
    input.inputs.riskFreeRate!.value = -1;
    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("unavailable");
    expect(result.reasons).toContain(
      "Os pesos de capital devem estar entre 0% e 100%.",
    );
    expect(result.reasons).toContain(
      "A alíquota usada no benefício fiscal deve estar entre 0% e 100%.",
    );
    expect(result.reasons).toContain(
      "O custo da dívida não pode ser negativo.",
    );
    expect(result.reasons).toContain(
      "A taxa-base precisa ser maior que -100%.",
    );
  });

  it.each([0, -1])(
    "does not value zero or negative reference FCFF (%s)",
    (fcff) => {
      const input = request();
      input.inputs.baseFcff!.value = fcff;
      const result = calculateStockValuation(input, operatingContext);
      expect(result.status).toBe("unavailable");
      expect(result.reasons).toContain(
        "O FCFF de referência precisa ser positivo para sustentar o valor terminal desta metodologia.",
      );
    },
  );

  it("rejects WACC below minus one before discounting cash flows", () => {
    const input = request();
    input.inputs.riskFreeRate!.value = 0.04;
    input.inputs.equityRiskPremium!.value = 0.05;
    input.inputs.beta!.value = -22;
    input.inputs.equityWeight!.value = 1;
    input.inputs.debtWeight!.value = 0;
    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("unavailable");
    expect(result.reasons).toContain(
      "O WACC calculado não permite descontar os fluxos.",
    );
  });

  it("returns explained unavailability when projected FCFF or enterprise value overflows", () => {
    const input = request();
    input.inputs.baseFcff!.value = 1e308;
    input.inputs.downsideGrowth!.value = 0.5;
    input.inputs.baseGrowth!.value = 0.5;
    input.inputs.upsideGrowth!.value = 0.5;
    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("unavailable");
    expect(result.reasons.join(" ")).toContain(
      "valores fora do intervalo numérico suportado",
    );
  });

  it("rejects a non-finite WACC derived from finite source components", () => {
    const input = request();
    input.inputs.beta!.value = 1e308;
    input.inputs.equityRiskPremium!.value = 1e308;
    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("unavailable");
    expect(result.reasons).toContain(
      "O WACC calculado excede o intervalo numérico suportado.",
    );
  });

  it.each([
    ["financial" as const, "não se aplica a empresas financeiras"],
    ["ambiguous" as const, "é ambígua"],
    ["unknown" as const, "ausente ou não mapeado"],
  ])("excludes sector %s with an explanation", (sector, reason) => {
    const result = calculateStockValuation(request(), {
      sector,
      shareGateComplete: false,
    });
    expect(result.status).toBe("unavailable");
    expect(result.reasons.join(" ")).toContain(reason);
  });

  it("does not combine a base rate and ERP until country-risk overlap is reviewed", () => {
    const input = request();
    input.countryRiskOverlapReviewed = false;
    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("unavailable");
    expect(result.reasons.join(" ")).toContain("risco-país duas vezes");
  });

  it("rejects a negative ERP and terminal or forecast growth below -100%", () => {
    const negativeErp = request();
    negativeErp.inputs.equityRiskPremium!.value = -0.01;
    const erpResult = calculateStockValuation(negativeErp, operatingContext);
    expect(erpResult.status).toBe("unavailable");
    expect(erpResult.reasons).toContain("O ERP não pode ser negativo.");

    const negativeTerminalGrowth = request();
    negativeTerminalGrowth.inputs.terminalGrowth!.value = -1;
    const terminalResult = calculateStockValuation(
      negativeTerminalGrowth,
      operatingContext,
    );
    expect(terminalResult.status).toBe("unavailable");
    expect(terminalResult.reasons).toContain(
      "O crescimento terminal deve ser maior que -100%.",
    );

    const negativeForecastGrowth = request();
    negativeForecastGrowth.inputs.baseGrowth!.value = -1;
    const forecastResult = calculateStockValuation(
      negativeForecastGrowth,
      operatingContext,
    );
    expect(forecastResult.status).toBe("unavailable");
    expect(forecastResult.reasons).toContain(
      "Crescimento do cenário-base deve ser maior que -100%.",
    );
  });

  it("requires explicit continuity and ordered scenario assumptions", () => {
    const input = request();
    input.continuityConfirmed = false;
    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("unavailable");
    expect(result.reasons.join(" ")).toContain(
      "Confirme que a empresa é operacional",
    );
    input.continuityConfirmed = true;
    input.inputs.downsideGrowth!.value = 0.05;
    const unordered = calculateStockValuation(input, operatingContext);
    expect(unordered.status).toBe("unavailable");
    expect(unordered.reasons.join(" ")).toContain(
      "Ordene os crescimentos dos cenários",
    );
  });

  it.each([
    ["currency", "USD", "precisa estar em BRL"],
    ["basis", "real", "base nominal"],
    ["asOf", "2025-12-31", "datas-base dos componentes não coincidem"],
    ["horizon", "forecast:3", "não corresponde ao horizonte explicitado"],
    ["unit", "currency", "unidade incompatível"],
  ])("explains incompatible %s metadata", (field, value, explanation) => {
    const input = request();
    const component = input.inputs.beta as Record<string, unknown>;
    component[field] = value;
    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("unavailable");
    expect(result.reasons.join(" ")).toContain(explanation);
  });

  it("returns unavailable when WACC terminal is not above stable growth", () => {
    const input = request();
    input.inputs.terminalWacc!.value = 0.02;
    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("unavailable");
    expect(result.reasons[0]).toContain("WACC explícito de estado estável");
  });

  it("rejects invalid capital weights and missing provenance instead of using defaults", () => {
    const input = request();
    input.inputs.debtWeight!.value = 0.2;
    input.inputs.beta!.source = " ";
    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("unavailable");
    expect(result.reasons.join(" ")).toContain(
      "pesos de capital devem somar 100%",
    );
    expect(result.reasons.join(" ")).toContain(
      "Beta precisa informar a origem",
    );
  });

  it("marks rate sensitivity points that violate the terminal-state condition", () => {
    const input = request();
    input.inputs.terminalWacc!.value = 0.03;
    input.inputs.terminalGrowth!.value = 0.02;
    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") return;
    expect(
      result.sensitivity.some((point) => point.enterpriseValue === null),
    ).toBe(true);
    expect(
      result.sensitivity.every(
        (point) => point.enterpriseValue !== null || point.reason !== null,
      ),
    ).toBe(true);
  });

  it("marks sensitivity points that overflow even when base scenarios remain calculable", () => {
    const input = request();
    input.forecastYears = 1;
    for (const key of [
      "downsideGrowth",
      "baseGrowth",
      "upsideGrowth",
      "riskFreeRate",
      "equityRiskPremium",
      "beta",
      "preTaxCostOfDebt",
      "taxRate",
      "equityWeight",
      "debtWeight",
    ] as const) {
      input.inputs[key]!.horizon = "forecast:1";
    }
    input.inputs.baseFcff!.value = 1.5e307;
    input.inputs.downsideGrowth!.value = 0;
    input.inputs.baseGrowth!.value = 0;
    input.inputs.upsideGrowth!.value = 0;
    input.inputs.riskFreeRate!.value = -0.9;
    input.inputs.equityRiskPremium!.value = 0;
    input.inputs.equityWeight!.value = 1;
    input.inputs.debtWeight!.value = 0;
    input.inputs.terminalGrowth!.value = 0;
    input.inputs.terminalWacc!.value = 10;

    const result = calculateStockValuation(input, operatingContext);
    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") return;
    expect(
      result.sensitivity.some((point) =>
        point.reason?.includes("excedeu o intervalo numérico suportado"),
      ),
    ).toBe(true);
  });

  it("uses server-resolved sector and share reconciliation, not client-supplied fields", async () => {
    const repository = {
      getStockValuationContext: vi.fn().mockResolvedValue(operatingContext),
    };
    const service = new StockValuationService(repository);
    const result = await service.calculate("TEST3", {
      ...request(),
      sector: "financial",
      shareReconciliation: { tickerClass: "COMPLETE", marketDateAligned: true },
    });
    expect(repository.getStockValuationContext).toHaveBeenCalledWith("TEST3");
    expect(result.status).toBe("calculated");
    expect(result.shareGateComplete).toBe(false);
    expect(result.valuePerShare).toBeNull();
  });

  it("keeps per-share value unavailable even with a complete class gate while equity bridge inputs are absent", () => {
    const result = calculateStockValuation(request(), {
      sector: "non_financial",
      shareGateComplete: true,
    });
    expect(result.status).toBe("calculated");
    expect(result.shareGateComplete).toBe(true);
    expect(result.equityValue).toBeNull();
    expect(result.valuePerShare).toBeNull();
    expect(result.shareValueUnavailableReason).toContain(
      "dívida líquida conciliada",
    );
  });

  it("returns an explained schema error for malformed payloads", () => {
    const result = calculateStockValuation({});
    expect(result.status).toBe("unavailable");
    expect(result.reasons).toEqual([
      "Os dados enviados não seguem o formato esperado.",
    ]);
  });
});
