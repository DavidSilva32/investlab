import {
  stockValuationRequestSchema,
  type StockValuationRequest,
} from "@/backend/schemas/stock-valuation.schema";
import {
  screenerRepository,
  type ScreenerRepository,
} from "@/backend/repositories/screener.repository";

export const stockValuationMethodVersion = "fcff-dcf-brl-nominal-v1";

export type StockValuationContext = {
  sector: "financial" | "non_financial" | "ambiguous" | "unknown";
  shareGateComplete: boolean;
};

type Component = NonNullable<StockValuationRequest["inputs"]["baseFcff"]>;
type ScenarioKey = "downside" | "base" | "upside";

const inputLabels: Record<keyof StockValuationRequest["inputs"], string> = {
  baseFcff: "FCFF de referência",
  downsideGrowth: "Crescimento do cenário conservador",
  baseGrowth: "Crescimento do cenário-base",
  upsideGrowth: "Crescimento do cenário otimista",
  riskFreeRate: "Taxa-base",
  equityRiskPremium: "Prêmio de risco do capital próprio (ERP)",
  beta: "Beta",
  preTaxCostOfDebt: "Custo da dívida antes de impostos",
  taxRate: "Alíquota efetiva usada no benefício fiscal da dívida",
  equityWeight: "Peso do capital próprio",
  debtWeight: "Peso da dívida",
  terminalGrowth: "Crescimento terminal",
  terminalWacc: "WACC de estado estável",
};

function unavailable(
  reasons: string[],
  valuationMethodVersion: string = stockValuationMethodVersion,
  context: StockValuationContext = {
    sector: "unknown",
    shareGateComplete: false,
  },
) {
  return {
    status: "unavailable" as const,
    valuationMethodVersion,
    currency: "BRL" as const,
    basis: "nominal" as const,
    reasons,
    wacc: null,
    scenarios: [],
    sensitivity: [],
    equityValue: null,
    valuePerShare: null,
    shareGateComplete: false,
    sectorClassification: context.sector,
    shareValueUnavailableReason:
      "Valor por ação indisponível: a reconciliação completa por classe/unit e a data de mercado não foram comprovadas.",
  };
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validateInputs(
  input: StockValuationRequest,
  context: StockValuationContext,
) {
  const reasons: string[] = [];
  if (input.forecastYears === null)
    reasons.push("Selecione um horizonte explícito para o fluxo de caixa.");
  if (!input.continuityConfirmed)
    reasons.push(
      "Confirme que a empresa é operacional e está sendo avaliada em continuidade.",
    );
  if (context.sector !== "non_financial") {
    reasons.push(
      context.sector === "financial"
        ? "A metodologia FCFF/DCF V1 não se aplica a empresas financeiras."
        : context.sector === "ambiguous"
          ? "A classificação setorial é ambígua; confirme uma atividade operacional não financeira compatível."
          : "Setor ausente ou não mapeado; a metodologia não foi aplicada.",
    );
  }

  const components = Object.entries(input.inputs) as [
    keyof StockValuationRequest["inputs"],
    Component | null,
  ][];
  for (const [key, component] of components) {
    if (!component) {
      reasons.push(`Informe o componente essencial: ${inputLabels[key]}.`);
    }
  }
  if (reasons.length > 0) return reasons;

  const present = components.map(([, component]) => component!);
  const referenceDate = present[0]!.asOf;
  if (present.some((component) => component.asOf !== referenceDate))
    reasons.push(
      "As datas-base dos componentes não coincidem; informe entradas compatíveis na mesma data.",
    );

  const expectedHorizons: Record<
    keyof StockValuationRequest["inputs"],
    string
  > = {
    baseFcff: "base",
    downsideGrowth: `forecast:${input.forecastYears}`,
    baseGrowth: `forecast:${input.forecastYears}`,
    upsideGrowth: `forecast:${input.forecastYears}`,
    riskFreeRate: `forecast:${input.forecastYears}`,
    equityRiskPremium: `forecast:${input.forecastYears}`,
    beta: `forecast:${input.forecastYears}`,
    preTaxCostOfDebt: `forecast:${input.forecastYears}`,
    taxRate: `forecast:${input.forecastYears}`,
    equityWeight: `forecast:${input.forecastYears}`,
    debtWeight: `forecast:${input.forecastYears}`,
    terminalGrowth: "terminal",
    terminalWacc: "terminal",
  };
  const expectedUnits: Record<
    keyof StockValuationRequest["inputs"],
    Component["unit"]
  > = {
    baseFcff: "currency",
    downsideGrowth: "percentage",
    baseGrowth: "percentage",
    upsideGrowth: "percentage",
    riskFreeRate: "percentage",
    equityRiskPremium: "percentage",
    beta: "ratio",
    preTaxCostOfDebt: "percentage",
    taxRate: "percentage",
    equityWeight: "percentage",
    debtWeight: "percentage",
    terminalGrowth: "percentage",
    terminalWacc: "percentage",
  };
  for (const [key, nullableComponent] of components) {
    const component = nullableComponent!;
    if (!component.type)
      reasons.push(
        `${inputLabels[key]} precisa classificar o tipo de entrada.`,
      );
    if (!component.source.trim())
      reasons.push(`${inputLabels[key]} precisa informar a origem.`);
    if (!isValidDate(component.asOf))
      reasons.push(
        `${inputLabels[key]} precisa informar uma data-base válida.`,
      );
    if (component.currency !== "BRL")
      reasons.push(`${inputLabels[key]} precisa estar em BRL nesta versão.`);
    if (component.basis !== "nominal")
      reasons.push(
        `${inputLabels[key]} precisa estar em base nominal nesta versão.`,
      );
    if (!component.method.trim())
      reasons.push(`${inputLabels[key]} precisa documentar o método.`);
    if (!component.version.trim())
      reasons.push(
        `${inputLabels[key]} precisa informar a versão da premissa.`,
      );
    if (component.horizon !== expectedHorizons[key]) {
      if (key === "riskFreeRate")
        reasons.push(
          "O prazo/vértice da taxa-base precisa ser informado e coincidir com o horizonte do DCF.",
        );
      else
        reasons.push(
          `${inputLabels[key]} não corresponde ao horizonte explicitado (${expectedHorizons[key]}).`,
        );
    }
    if (component.unit !== expectedUnits[key])
      reasons.push(`${inputLabels[key]} tem unidade incompatível.`);
  }
  if (!input.countryRiskOverlapReviewed)
    reasons.push(
      "Confirme que a combinação explícita entre taxa-base e ERP não conta o risco-país duas vezes.",
    );

  const { inputs } = input;
  const numeric = Object.fromEntries(
    components.map(([key, component]) => [key, component?.value]),
  ) as Record<keyof StockValuationRequest["inputs"], number | undefined>;
  if (numeric.baseFcff !== undefined && numeric.baseFcff <= 0)
    reasons.push(
      "O FCFF de referência precisa ser positivo para sustentar o valor terminal desta metodologia.",
    );
  if (
    numeric.equityWeight === undefined ||
    numeric.debtWeight === undefined ||
    Math.abs(numeric.equityWeight + numeric.debtWeight - 1) > 0.000001
  )
    reasons.push("Os pesos de capital devem somar 100%.");
  if (
    numeric.equityWeight !== undefined &&
    numeric.debtWeight !== undefined &&
    (numeric.equityWeight < 0 ||
      numeric.debtWeight < 0 ||
      numeric.equityWeight > 1 ||
      numeric.debtWeight > 1)
  )
    reasons.push("Os pesos de capital devem estar entre 0% e 100%.");
  if (
    numeric.taxRate !== undefined &&
    (numeric.taxRate < 0 || numeric.taxRate > 1)
  )
    reasons.push(
      "A alíquota usada no benefício fiscal deve estar entre 0% e 100%.",
    );
  if (numeric.preTaxCostOfDebt !== undefined && numeric.preTaxCostOfDebt < 0)
    reasons.push("O custo da dívida não pode ser negativo.");
  if (numeric.riskFreeRate !== undefined && numeric.riskFreeRate <= -1)
    reasons.push("A taxa-base precisa ser maior que -100%.");
  if (numeric.equityRiskPremium !== undefined && numeric.equityRiskPremium < 0)
    reasons.push("O ERP não pode ser negativo.");
  if (
    numeric.downsideGrowth !== undefined &&
    numeric.baseGrowth !== undefined &&
    numeric.upsideGrowth !== undefined &&
    (numeric.downsideGrowth > numeric.baseGrowth ||
      numeric.baseGrowth > numeric.upsideGrowth)
  )
    reasons.push(
      "Ordene os crescimentos dos cenários do menor (conservador) ao maior (otimista).",
    );
  if (numeric.terminalGrowth !== undefined && numeric.terminalGrowth <= -1)
    reasons.push("O crescimento terminal deve ser maior que -100%.");
  for (const key of ["downsideGrowth", "baseGrowth", "upsideGrowth"] as const)
    if (numeric[key] !== undefined && numeric[key] <= -1)
      reasons.push(`${inputLabels[key]} deve ser maior que -100%.`);
  return reasons;
}

export function discountedEnterpriseValue(
  baseFcff: number,
  growth: number,
  forecastWacc: number,
  terminalWacc: number,
  terminalGrowth: number,
  years: number,
) {
  if (
    forecastWacc <= -1 ||
    terminalWacc <= terminalGrowth ||
    terminalWacc <= -1 ||
    terminalGrowth <= -1
  )
    return null;
  if (
    ![baseFcff, growth, forecastWacc, terminalWacc, terminalGrowth].every(
      Number.isFinite,
    )
  )
    return null;
  let presentValue = 0;
  let lastFcff = baseFcff;
  for (let year = 1; year <= years; year += 1) {
    lastFcff *= 1 + growth;
    const discountedFcff = lastFcff / (1 + forecastWacc) ** year;
    if (!Number.isFinite(lastFcff) || !Number.isFinite(discountedFcff))
      return null;
    presentValue += discountedFcff;
    if (!Number.isFinite(presentValue)) return null;
  }
  const terminalValue =
    (lastFcff * (1 + terminalGrowth)) / (terminalWacc - terminalGrowth);
  if (!Number.isFinite(terminalValue)) return null;
  const enterpriseValue =
    presentValue + terminalValue / (1 + forecastWacc) ** years;
  return Number.isFinite(enterpriseValue) ? enterpriseValue : null;
}

function calculateStockValuationWithContext(
  raw: unknown,
  context: StockValuationContext,
) {
  const parsed = stockValuationRequestSchema.safeParse(raw);
  if (!parsed.success)
    return unavailable(
      ["Os dados enviados não seguem o formato esperado."],
      stockValuationMethodVersion,
      context,
    );
  const input = parsed.data;
  const reasons = validateInputs(input, context);
  if (reasons.length)
    return unavailable(reasons, stockValuationMethodVersion, context);

  const { inputs } = input;
  const riskFreeRate = inputs.riskFreeRate!.value;
  const erp = inputs.equityRiskPremium!.value;
  const beta = inputs.beta!.value;
  const preTaxCostOfDebt = inputs.preTaxCostOfDebt!.value;
  const taxRate = inputs.taxRate!.value;
  const equityWeight = inputs.equityWeight!.value;
  const debtWeight = inputs.debtWeight!.value;
  const wacc =
    equityWeight * (riskFreeRate + beta * erp) +
    debtWeight * preTaxCostOfDebt * (1 - taxRate);
  const terminalWacc = inputs.terminalWacc!.value;
  const terminalGrowth = inputs.terminalGrowth!.value;
  if (!Number.isFinite(wacc))
    return unavailable(
      ["O WACC calculado excede o intervalo numérico suportado."],
      stockValuationMethodVersion,
      context,
    );
  if (terminalWacc <= terminalGrowth)
    return unavailable(
      [
        "O WACC explícito de estado estável precisa ser maior que o crescimento terminal.",
      ],
      stockValuationMethodVersion,
      context,
    );
  if (wacc <= -1)
    return unavailable(
      ["O WACC calculado não permite descontar os fluxos."],
      stockValuationMethodVersion,
      context,
    );

  const growths: Record<ScenarioKey, number> = {
    downside: inputs.downsideGrowth!.value,
    base: inputs.baseGrowth!.value,
    upside: inputs.upsideGrowth!.value,
  };
  const scenarios = Object.entries(growths).map(([key, growth]) => ({
    key: key as ScenarioKey,
    growth,
    enterpriseValue: discountedEnterpriseValue(
      inputs.baseFcff!.value,
      growth,
      wacc,
      terminalWacc,
      terminalGrowth,
      input.forecastYears!,
    ),
  }));
  if (scenarios.some(({ enterpriseValue }) => enterpriseValue === null))
    return unavailable(
      [
        "Um ou mais cenários não puderam ser calculados; verifique os parâmetros e valores fora do intervalo numérico suportado.",
      ],
      stockValuationMethodVersion,
      context,
    );

  const sensitivity = [-0.01, 0, 0.01].flatMap((forecastWaccShift) =>
    [-0.01, 0, 0.01].flatMap((terminalWaccShift) =>
      [-0.005, 0, 0.005].map((growthShift) => {
        const sensitivityValue = discountedEnterpriseValue(
          inputs.baseFcff!.value,
          growths.base,
          wacc + forecastWaccShift,
          terminalWacc + terminalWaccShift,
          terminalGrowth + growthShift,
          input.forecastYears!,
        );
        return {
          forecastWacc: wacc + forecastWaccShift,
          terminalWacc: terminalWacc + terminalWaccShift,
          terminalGrowth: terminalGrowth + growthShift,
          enterpriseValue: sensitivityValue,
          reason:
            sensitivityValue === null
              ? terminalWacc + terminalWaccShift <= terminalGrowth + growthShift
                ? "Ponto omitido: WACC terminal precisa ser maior que o crescimento terminal."
                : "Ponto omitido: o resultado excedeu o intervalo numérico suportado."
              : null,
        };
      }),
    ),
  );
  return {
    status: "calculated" as const,
    valuationMethodVersion: stockValuationMethodVersion,
    currency: "BRL" as const,
    basis: "nominal" as const,
    reasons: [],
    wacc,
    scenarios,
    sensitivity,
    equityValue: null,
    valuePerShare: null,
    shareValueUnavailableReason: context.shareGateComplete
      ? "Valor por ação indisponível nesta versão: dívida líquida conciliada e número de ações por classe não são entradas disponíveis neste cálculo."
      : "Valor por ação indisponível: a reconciliação completa por classe/unit e a data de mercado não foram comprovadas.",
    provenance: inputs,
    shareGateComplete: context.shareGateComplete,
    sectorClassification: context.sector,
  };
}

export function calculateStockValuation(
  raw: unknown,
  context: StockValuationContext = {
    sector: "unknown",
    shareGateComplete: false,
  },
) {
  return calculateStockValuationWithContext(raw, context);
}

export class StockValuationService {
  constructor(
    private readonly repository: Pick<
      ScreenerRepository,
      "getStockValuationContext"
    > = screenerRepository,
  ) {}

  async calculate(ticker: string, raw: unknown) {
    const context = await this.repository.getStockValuationContext(ticker);
    return calculateStockValuationWithContext(raw, context);
  }
}

export const stockValuationService = new StockValuationService();
