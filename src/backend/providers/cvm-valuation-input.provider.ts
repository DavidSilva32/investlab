import { createHash } from "node:crypto";
import { Unzip, UnzipInflate } from "fflate";

const cvmBaseUrl = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC";
const statementNames = new Set(["BPA", "BPP", "DRE", "DFC_MI"]);

export type ValuationDocumentType = "DFP" | "ITR";
export type ValuationStatement = "BPA" | "BPP" | "DRE" | "DFC_MI";
export type ValuationCandidateKind =
  | "EBIT_CANDIDATE"
  | "TAX_CANDIDATE"
  | "DEPRECIATION_AMORTIZATION_CANDIDATE"
  | "CAPEX_CANDIDATE"
  | "CASH_BALANCE_CANDIDATE"
  | "FINANCIAL_DEBT_CANDIDATE"
  | "WORKING_CAPITAL_FLOW_CANDIDATE"
  | "BALANCE_CURRENT_ASSET_CANDIDATE"
  | "BALANCE_CURRENT_LIABILITY_CANDIDATE"
  | "BALANCE_NON_CURRENT_LIABILITY_CANDIDATE"
  | "OPERATING_CASH_FLOW_CANDIDATE"
  | "INVESTING_CASH_FLOW_CANDIDATE";

export type ValuationAccountingFactRecord = {
  factKey: string;
  issuerCnpj: string;
  documentType: ValuationDocumentType;
  documentId: string | null;
  documentCategory: string | null;
  documentReceivedDate: string | null;
  metadataMatch: "MATCHED" | "MISSING" | "AMBIGUOUS";
  referenceDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  statement: ValuationStatement;
  accountCode: string;
  accountLabel: string;
  candidateKind: ValuationCandidateKind | null;
  rawValue: string | null;
  currency: string | null;
  scale: string | null;
  statementGroup: string | null;
  exerciseOrder: string | null;
  version: string;
  sourceFile: string;
  sourceRow: number;
  archiveFetchedAt: Date;
  recordType: "REPORTED" | "DERIVED";
  calculatedValue: string | null;
  derivationMethod: "ITR_YTD_DIFFERENCE" | "DFP_ANNUAL_MINUS_ITR_YTD" | null;
  derivationCurrentFactKey: string | null;
  derivationPreviousFactKey: string | null;
};

type CsvRow = Record<string, string | undefined>;
type RawAccountRow = {
  issuerCnpj: string;
  referenceDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  statement: ValuationStatement;
  accountCode: string;
  accountLabel: string;
  candidateKind: ValuationCandidateKind | null;
  rawValue: string | null;
  currency: string | null;
  scale: string | null;
  statementGroup: string | null;
  exerciseOrder: string | null;
  version: string;
  sourceFile: string;
  sourceRow: number;
};
type DocumentMetadata = {
  issuerCnpj: string;
  referenceDate: string;
  version: string;
  documentType: string;
  documentId: string | null;
  category: string | null;
  receivedDate: string | null;
};

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ";" && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += character;
  }
  cells.push(cell);
  return cells;
}

function normalizeHeader(value: string) {
  return value.replace(/^(?:\uFEFF|ï»¿)/, "").trim();
}

function normalizeCnpj(value: string | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeVersion(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? String(parsed) : normalized;
}

function normalizeDate(value: string | undefined) {
  const date = value?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function statementFromFile(name: string): ValuationStatement | null {
  const match = name.match(/_(BPA|BPP|DRE|DFC_MI)_con_/i);
  if (!match) return null;
  const statement = match[1]!.toUpperCase();
  return statementNames.has(statement)
    ? (statement as ValuationStatement)
    : null;
}

function documentSummaryType(
  name: string,
  documentType: ValuationDocumentType,
) {
  return new RegExp(
    `^${documentType.toLowerCase()}_cia_aberta_\\d{4}\\.csv$`,
    "i",
  ).test(name.split("/").at(-1) ?? name);
}

function candidateKind(
  statement: ValuationStatement,
  accountCode: string,
  label: string,
): ValuationCandidateKind | null {
  const normalized = normalizeLabel(label);
  if (statement === "DRE" && accountCode === "3.05") {
    return normalized.startsWith(
      "RESULTADO ANTES DO RESULTADO FINANCEIRO E DOS TRIBUTOS",
    )
      ? "EBIT_CANDIDATE"
      : null;
  }
  if (statement === "DRE" && accountCode === "3.08") {
    return /^(IMPOSTO DE RENDA|IMPOSTO DE RENDA E CONTRIBUICAO SOCIAL|TRIBUTOS SOBRE O LUCRO)/.test(
      normalized,
    )
      ? "TAX_CANDIDATE"
      : null;
  }
  if (statement === "BPA" && /^1\.01(?:\.|$)/.test(accountCode)) {
    if (
      /^(CAIXA|CAIXAS|BANCOS|EQUIVALENTE DE CAIXA|EQUIVALENTES DE CAIXA|APLICACOES DE LIQUIDEZ IMEDIATA)/.test(
        normalized,
      )
    )
      return "CASH_BALANCE_CANDIDATE";
    return "BALANCE_CURRENT_ASSET_CANDIDATE";
  }
  if (statement === "BPP" && /^2\.0[12](?:\.|$)/.test(accountCode)) {
    if (
      /\b(EMPRESTIMOS?|FINANCIAMENTOS?|DEBENTURES?|ARRENDAMENTOS?)\b/.test(
        normalized,
      )
    )
      return "FINANCIAL_DEBT_CANDIDATE";
    return accountCode.startsWith("2.01")
      ? "BALANCE_CURRENT_LIABILITY_CANDIDATE"
      : "BALANCE_NON_CURRENT_LIABILITY_CANDIDATE";
  }
  if (statement !== "DFC_MI") return null;
  if (/^6\.01(?:\.|$)/.test(accountCode)) {
    if (
      /\b(CONTAS A RECEBER|ESTOQUES|FORNECEDORES|OBRIGACOES TRIBUTARIAS|SALARIOS E ENCARGOS|OUTROS ATIVOS|OUTROS PASSIVOS)\b/.test(
        normalized,
      )
    )
      return "WORKING_CAPITAL_FLOW_CANDIDATE";
    if (/\b(DEPRECIACAO|AMORTIZACAO|EXAUSTAO)\b/.test(normalized))
      return "DEPRECIATION_AMORTIZATION_CANDIDATE";
    return "OPERATING_CASH_FLOW_CANDIDATE";
  }
  if (/^6\.02(?:\.|$)/.test(accountCode)) {
    if (
      /\b(AQUISICAO|AQUISICOES|ADICAO|ADICOES)\b/.test(normalized) &&
      /\b(IMOBILIZADO|INTANGIVEL)\b/.test(normalized) &&
      !/\b(EMPRESA|NEGOCIO|CONTROLADA|COLIGADA|PARTICIPACAO|INVESTIDA|INVESTIMENTOS)\b/.test(
        normalized,
      )
    )
      return "CAPEX_CANDIDATE";
    return "INVESTING_CASH_FLOW_CANDIDATE";
  }
  return null;
}
function key(...parts: string[]) {
  return parts.join("\u001f");
}

function factKey(parts: string[]) {
  return createHash("sha256")
    .update(key(...parts))
    .digest("hex");
}

function parseReceivedDate(value: string | undefined) {
  const date = normalizeDate(value);
  if (date) return date;
  const normalized = value?.trim() ?? "";
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function matchDocumentMetadata(
  raw: RawAccountRow,
  documentType: ValuationDocumentType,
  metadata: Map<string, DocumentMetadata[]>,
): {
  value: DocumentMetadata | null;
  status: "MATCHED" | "MISSING" | "AMBIGUOUS";
} {
  const matches = metadata.get(
    key(
      raw.issuerCnpj,
      raw.referenceDate,
      normalizeVersion(raw.version),
      documentType,
    ),
  );
  if (!matches || matches.length === 0)
    return { value: null, status: "MISSING" };
  if (matches.length !== 1) return { value: null, status: "AMBIGUOUS" };
  return { value: matches[0]!, status: "MATCHED" };
}
function reportedFact(
  raw: RawAccountRow,
  documentType: ValuationDocumentType,
  metadata: Map<string, DocumentMetadata[]>,
  archiveFetchedAt: Date,
): ValuationAccountingFactRecord {
  const match = matchDocumentMetadata(raw, documentType, metadata);
  return {
    factKey: factKey([
      "REPORTED",
      documentType,
      raw.sourceFile,
      String(raw.sourceRow),
      raw.issuerCnpj,
      raw.referenceDate,
      raw.version,
      raw.accountCode,
    ]),
    issuerCnpj: raw.issuerCnpj,
    documentType,
    documentId: match.value?.documentId ?? null,
    documentCategory: match.value?.category ?? null,
    documentReceivedDate: match.value?.receivedDate ?? null,
    metadataMatch: match.status,
    referenceDate: raw.referenceDate,
    periodStart: raw.periodStart,
    periodEnd: raw.periodEnd,
    statement: raw.statement,
    accountCode: raw.accountCode,
    accountLabel: raw.accountLabel,
    candidateKind: raw.candidateKind,
    rawValue: raw.rawValue,
    currency: raw.currency,
    scale: raw.scale,
    statementGroup: raw.statementGroup,
    exerciseOrder: raw.exerciseOrder,
    version: raw.version,
    sourceFile: raw.sourceFile,
    sourceRow: raw.sourceRow,
    archiveFetchedAt,
    recordType: "REPORTED",
    calculatedValue: null,
    derivationMethod: null,
    derivationCurrentFactKey: null,
    derivationPreviousFactKey: null,
  };
}

function parseDecimal(value: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const match = normalized.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const fraction = match[3] ?? "";
  const sign = match[1] === "-" ? -1n : 1n;
  const digits = BigInt(`${match[2]}${fraction}`);
  return { value: digits * sign, scale: fraction.length };
}

function subtractValues(current: string | null, previous: string | null) {
  if (current === null || previous === null) return null;
  const currentDecimal = parseDecimal(current);
  const previousDecimal = parseDecimal(previous);
  if (!currentDecimal || !previousDecimal) return null;
  const precision = Math.max(currentDecimal.scale, previousDecimal.scale);
  const currentValue =
    currentDecimal.value * 10n ** BigInt(precision - currentDecimal.scale);
  const previousValue =
    previousDecimal.value * 10n ** BigInt(precision - previousDecimal.scale);
  const difference = currentValue - previousValue;
  const negative = difference < 0n;
  const digits = (negative ? -difference : difference)
    .toString()
    .padStart(precision + 1, "0");
  const output =
    precision === 0
      ? digits
      : `${digits.slice(0, -precision)}.${digits.slice(-precision)}`;
  return `${negative ? "-" : ""}${output}`;
}

function isComparable(
  current: ValuationAccountingFactRecord,
  previous: ValuationAccountingFactRecord,
) {
  return (
    current.issuerCnpj === previous.issuerCnpj &&
    current.statement === previous.statement &&
    current.accountCode === previous.accountCode &&
    normalizeLabel(current.accountLabel) ===
      normalizeLabel(previous.accountLabel) &&
    current.candidateKind === previous.candidateKind &&
    current.currency === previous.currency &&
    current.scale === previous.scale &&
    current.statementGroup === previous.statementGroup &&
    current.exerciseOrder === previous.exerciseOrder &&
    current.periodStart === previous.periodStart &&
    current.metadataMatch === "MATCHED" &&
    previous.metadataMatch === "MATCHED" &&
    current.documentReceivedDate !== null &&
    previous.documentReceivedDate !== null &&
    previous.documentReceivedDate < current.documentReceivedDate
  );
}

function latestAsOf(
  facts: ValuationAccountingFactRecord[],
  current: ValuationAccountingFactRecord,
  referenceDate: string,
) {
  const candidates = facts
    .filter(
      (fact) =>
        fact.recordType === "REPORTED" &&
        fact.documentType === "ITR" &&
        fact.referenceDate === referenceDate &&
        isComparable(current, fact),
    )
    .sort((left, right) =>
      right.documentReceivedDate!.localeCompare(left.documentReceivedDate!),
    );
  const latest = candidates[0];
  if (
    !latest ||
    (candidates[1] &&
      candidates[1].documentReceivedDate === latest.documentReceivedDate)
  )
    return undefined;
  return latest;
}

function derivedFact(
  current: ValuationAccountingFactRecord,
  previous: ValuationAccountingFactRecord,
  method: ValuationAccountingFactRecord["derivationMethod"],
  periodStart: string,
  periodEnd: string,
) {
  const calculatedValue = subtractValues(current.rawValue, previous.rawValue);
  if (calculatedValue === null) return null;
  return {
    ...current,
    factKey: factKey([
      "DERIVED",
      method ?? "",
      current.factKey,
      previous.factKey,
    ]),
    periodStart,
    periodEnd,
    recordType: "DERIVED" as const,
    calculatedValue,
    derivationMethod: method,
    derivationCurrentFactKey: current.factKey,
    derivationPreviousFactKey: previous.factKey,
  } satisfies ValuationAccountingFactRecord;
}

export function deriveQuarterlyFlowFacts(
  facts: ValuationAccountingFactRecord[],
): ValuationAccountingFactRecord[] {
  const reported = facts.filter((fact) => fact.recordType === "REPORTED");
  const derived: ValuationAccountingFactRecord[] = [];
  for (const current of reported) {
    if (
      current.documentType !== "ITR" ||
      current.periodStart === null ||
      current.periodEnd === null ||
      current.documentReceivedDate === null ||
      !current.candidateKind ||
      current.statement === "BPA" ||
      current.statement === "BPP"
    )
      continue;
    const year = current.periodEnd.slice(0, 4);
    if (current.periodStart !== `${year}-01-01`) continue;
    const quarterEnd = current.periodEnd;
    const quarter =
      quarterEnd === `${year}-03-31`
        ? 1
        : quarterEnd === `${year}-06-30`
          ? 2
          : quarterEnd === `${year}-09-30`
            ? 3
            : 0;
    if (quarter === 0 || quarter === 1) continue;
    const previousEnd = quarter === 2 ? `${year}-03-31` : `${year}-06-30`;
    const previous = latestAsOf(reported, current, previousEnd);
    if (
      !previous ||
      previous.periodStart !== current.periodStart ||
      previous.periodEnd !== previousEnd
    )
      continue;
    const periodStartDate = new Date(`${previousEnd}T00:00:00.000Z`);
    periodStartDate.setUTCDate(periodStartDate.getUTCDate() + 1);
    const fact = derivedFact(
      current,
      previous,
      "ITR_YTD_DIFFERENCE",
      periodStartDate.toISOString().slice(0, 10),
      quarterEnd,
    );
    if (fact) derived.push(fact);
  }
  for (const current of reported) {
    if (
      current.documentType !== "DFP" ||
      current.periodStart === null ||
      current.periodEnd === null ||
      current.documentReceivedDate === null ||
      !current.candidateKind ||
      current.statement === "BPA" ||
      current.statement === "BPP"
    )
      continue;
    const year = current.periodEnd.slice(0, 4);
    if (
      current.periodStart !== `${year}-01-01` ||
      current.periodEnd !== `${year}-12-31`
    )
      continue;
    const previousEnd = `${year}-09-30`;
    const previous = latestAsOf(reported, current, previousEnd);
    if (
      !previous ||
      previous.periodStart !== current.periodStart ||
      previous.periodEnd !== previousEnd
    )
      continue;
    const periodStartDate = new Date(`${previousEnd}T00:00:00.000Z`);
    periodStartDate.setUTCDate(periodStartDate.getUTCDate() + 1);
    const fact = derivedFact(
      current,
      previous,
      "DFP_ANNUAL_MINUS_ITR_YTD",
      periodStartDate.toISOString().slice(0, 10),
      current.periodEnd,
    );
    if (fact) derived.push(fact);
  }
  return derived;
}
function isCandidateRow(statement: ValuationStatement, accountCode: string) {
  if (statement === "DRE")
    return accountCode === "3.05" || accountCode === "3.08";
  if (statement === "DFC_MI") return /^6\.0[12](?:\.|$)/.test(accountCode);
  if (statement === "BPA") return /^1\.01(?:\.|$)/.test(accountCode);
  return /^2\.0[12](?:\.|$)/.test(accountCode);
}

async function parseAccountingArchive(
  response: Response,
  documentType: ValuationDocumentType,
  year: number,
  registryByCvmCode: Map<string, string>,
  archiveFetchedAt: Date,
): Promise<ValuationAccountingFactRecord[]> {
  if (!response.ok)
    throw new Error(`CVM ${documentType} request failed: ${response.status}`);
  if (!response.body)
    throw new Error(`CVM ${documentType} response has no body`);
  const metadata = new Map<string, DocumentMetadata[]>();
  const rawRows: RawAccountRow[] = [];
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  let activeFiles = 0;
  let readerDone = false;
  let settled = false;
  let resolveComplete: () => void;
  let rejectComplete: (error: unknown) => void = () => undefined;
  const complete = new Promise<void>((resolve, reject) => {
    resolveComplete = resolve;
    rejectComplete = reject;
  });
  const finish = () => {
    if (readerDone && activeFiles === 0 && !settled) {
      settled = true;
      resolveComplete();
    }
  };
  unzip.onfile = (file) => {
    const statement = statementFromFile(file.name);
    const isSummary = documentSummaryType(file.name, documentType);
    if (!statement && !isSummary) {
      file.ondata = () => undefined;
      file.start();
      return;
    }
    activeFiles += 1;
    let headers: string[] | null = null;
    let rowNumber = 0;
    let pending = "";
    const decoder = new TextDecoder("iso-8859-1");
    const onLine = (line: string) => {
      if (!headers) {
        headers = parseCsvLine(line).map(normalizeHeader);
        return;
      }
      rowNumber += 1;
      const row = Object.fromEntries(
        parseCsvLine(line).map((cell, index) => [headers![index] ?? "", cell]),
      ) as CsvRow;
      if (isSummary) {
        const issuerCnpj = normalizeCnpj(row.CNPJ_CIA);
        const referenceDate = normalizeDate(row.DT_REFER);
        const rawVersion = row.VERSAO?.trim() ?? "";
        if (issuerCnpj.length !== 14 || !referenceDate || !rawVersion) return;
        const entry: DocumentMetadata = {
          issuerCnpj,
          referenceDate,
          version: normalizeVersion(rawVersion),
          documentType: row.CATEG_DOC?.trim() ?? documentType,
          documentId: row.ID_DOC?.trim() || null,
          category: row.CATEG_DOC?.trim() || null,
          receivedDate: parseReceivedDate(row.DT_RECEB),
        };
        const index = key(
          issuerCnpj,
          referenceDate,
          entry.version,
          entry.documentType.toUpperCase(),
        );
        metadata.set(index, [...(metadata.get(index) ?? []), entry]);
        return;
      }
      const issuerCnpj = normalizeCnpj(row.CNPJ_CIA);
      const cvmCode = row.CD_CVM?.trim() ?? "";
      if (
        issuerCnpj.length !== 14 ||
        registryByCvmCode.get(cvmCode) !== issuerCnpj
      )
        return;
      const accountCode = row.CD_CONTA?.trim() ?? "";
      if (!isCandidateRow(statement!, accountCode)) return;
      const referenceDate = normalizeDate(row.DT_REFER);
      if (!referenceDate || Number(referenceDate.slice(0, 4)) < year - 7)
        return;
      const accountLabel = row.DS_CONTA?.trim() ?? "";
      rawRows.push({
        issuerCnpj,
        referenceDate,
        periodStart: normalizeDate(row.DT_INI_EXERC),
        periodEnd: normalizeDate(row.DT_FIM_EXERC),
        statement: statement!,
        accountCode,
        accountLabel,
        candidateKind: candidateKind(statement!, accountCode, accountLabel),
        rawValue: row.VL_CONTA?.trim() || null,
        currency: row.MOEDA?.trim() || null,
        scale: row.ESCALA_MOEDA?.trim() || null,
        statementGroup: row.GRUPO_DFP?.trim() || null,
        exerciseOrder: row.ORDEM_EXERC?.trim() || null,
        version: row.VERSAO?.trim() ?? "",
        sourceFile: `${documentType.toLowerCase()}_cia_aberta_${year}.zip#${file.name}`,
        sourceRow: rowNumber + 1,
      });
    };
    file.ondata = (error, data, final) => {
      if (settled) return;
      if (error) {
        settled = true;
        rejectComplete(error);
        return;
      }
      pending += decoder.decode(data, { stream: !final });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) onLine(line);
      if (final) {
        if (pending) onLine(pending);
        pending = "";
        activeFiles -= 1;
        finish();
      }
    };
    file.start();
  };
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      unzip.push(value, false);
    }
    unzip.push(new Uint8Array(), true);
    readerDone = true;
    finish();
  } catch (error) {
    if (!settled) {
      settled = true;
      rejectComplete(error);
    }
  }
  await complete;
  return rawRows.map((row) =>
    reportedFact(row, documentType, metadata, archiveFetchedAt),
  );
}

export async function parseCvmValuationArchive(
  response: Response,
  documentType: ValuationDocumentType,
  year: number,
  registryByCvmCode: Map<string, string>,
  archiveFetchedAt: Date,
) {
  return parseAccountingArchive(
    response,
    documentType,
    year,
    registryByCvmCode,
    archiveFetchedAt,
  );
}

export class CvmValuationInputProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async getArchive(
    documentType: ValuationDocumentType,
    year: number,
    registryByCvmCode: Map<string, string>,
  ) {
    const documentPath = documentType === "DFP" ? "DFP" : "ITR";
    const filename = `${documentType.toLowerCase()}_cia_aberta_${year}.zip`;
    const fetchedAt = new Date();
    const response = await this.fetcher(
      `${cvmBaseUrl}/${documentPath}/DADOS/${filename}`,
    );
    return parseAccountingArchive(
      response,
      documentType,
      year,
      registryByCvmCode,
      fetchedAt,
    );
  }
}
