import { Unzip, UnzipInflate } from "fflate";
import { createHash } from "node:crypto";

const cvmFreBaseUrl = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS";
const freTables = {
  capital_social: "CAPITAL_SOCIAL",
  capital_social_classe_acao: "CAPITAL_SOCIAL_CLASS",
  distribuicao_capital: "CAPITAL_DISTRIBUTION",
  distribuicao_capital_classe_acao: "CAPITAL_DISTRIBUTION_CLASS",
  capital_social_titulo_conversivel: "CONVERTIBLE_SECURITY_DESCRIPTION",
  posicao_acionaria: "SHAREHOLDER_POSITION",
  posicao_acionaria_classe_acao: "SHAREHOLDER_POSITION_CLASS",
} as const;

export type CvmShareCapitalRecordKind =
  (typeof freTables)[keyof typeof freTables] | "TREASURY_POSITION";

export type CvmShareCapitalRecord = {
  factKey: string;
  issuerCnpj: string;
  referenceDate: string | null;
  documentVersion: number;
  documentId: string;
  documentReceivedDate: string | null;
  metadataStatus: "MATCHED" | "UNAVAILABLE" | "AMBIGUOUS";
  recordKind: CvmShareCapitalRecordKind;
  capitalId: string | null;
  shareholderId: string | null;
  sourceArchive: string;
  sourceFile: string;
  sourceRow: number;
  rawFields: Record<string, string>;
  tickerClassStatus: "UNAVAILABLE";
  quantitySemantics: string;
  fetchedAt: string;
};

export type CvmShareCapitalDiagnostics = {
  archiveYear: number;
  sourceArchive: string;
  filesRead: number;
  rowsRead: number;
  records: number;
  documentsMatched: number;
  documentsWithoutMetadata: number;
  ambiguousDocuments: number;
  treasuryPositionRecords: number;
  ingestionStatus: "COMPLETED" | "PARTIAL";
  unavailableCoverageReasons: string[];
  unsupportedEventTables: string[];
};

type CsvRow = Record<string, string>;
type DocumentKey = string;
type Metadata = {
  receivedDate: string;
  recordCount: number;
};

const requiredHeaders: Record<string, readonly string[]> = {
  metadata: ["CNPJ_CIA", "DT_REFER", "VERSAO", "ID_DOC", "DT_RECEB"],
  capital_social: [
    "CNPJ_Companhia",
    "Data_Referencia",
    "Versao",
    "ID_Documento",
    "ID_Capital_Social",
    "Tipo_Capital",
    "Quantidade_Total_Acoes",
  ],
  capital_social_classe_acao: [
    "CNPJ_Companhia",
    "Data_Referencia",
    "Versao",
    "ID_Documento",
    "ID_Capital_Social",
    "Tipo_Classe_Acao_Preferencial",
    "Quantidade_Acoes",
  ],
  distribuicao_capital: [
    "CNPJ_Companhia",
    "Data_Referencia",
    "Versao",
    "ID_Documento",
    "Quantidade_Total_Acoes_Circulacao",
    "Percentual_Total_Acoes_Circulacao",
  ],
  distribuicao_capital_classe_acao: [
    "CNPJ_Companhia",
    "Data_Referencia",
    "Versao",
    "ID_Documento",
    "Sigla_Classe_Acoes_Preferenciais",
    "Classe_Acoes_Preferenciais",
    "Quantidade_Acoes_Preferenciais_Circulacao",
  ],
  capital_social_titulo_conversivel: [
    "CNPJ_Companhia",
    "Data_Referencia",
    "Versao",
    "ID_Documento",
    "ID_Capital_Social",
    "Titulo_Conversivel_Acao",
    "Condicoes_Conversao",
  ],
  posicao_acionaria: [
    "CNPJ_Companhia",
    "Data_Referencia",
    "Versao",
    "ID_Documento",
    "ID_Acionista",
    "Acionista",
    "CPF_CNPJ_Acionista",
    "CPF_CNPJ_Acionista_Relacionado",
    "CPF_CNPJ_Representante_legal",
    "Quantidade_Total_Acoes_Circulacao",
    "Data_Composicao_Capital_Social",
    "Data_Ultima_Alteracao",
  ],
  posicao_acionaria_classe_acao: [
    "CNPJ_Companhia",
    "Data_Referencia",
    "Versao",
    "ID_Documento",
    "ID_Acionista",
    "Tipo_Classe_Acao_Preferencial",
    "Quantidade_Acoes",
    "Percentual_Acoes",
  ],
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ";" && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }
  if (quoted)
    throw new Error("CVM FRE CSV contains an unterminated quoted field");
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function documentKey(row: CsvRow): DocumentKey {
  return [
    row.CNPJ_CIA ?? row.CNPJ_Companhia ?? "",
    row.DT_REFER ?? row.Data_Referencia ?? "",
    row.VERSAO ?? row.Versao ?? "",
    row.ID_DOC ?? row.ID_Documento ?? "",
  ].join("|");
}

function normalizeCnpj(value: string) {
  return value.replace(/\D/g, "");
}

function parseInteger(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function rowsFromCsv(
  bytes: Uint8Array,
  tableName: string,
  consume: (row: CsvRow, rowNumber: number) => void,
) {
  const text = new TextDecoder("iso-8859-1").decode(bytes);
  const rows = parseCsv(text);
  const headerRow = rows.shift();
  if (!headerRow) throw new Error(`CVM FRE ${tableName} CSV has no header`);
  const headers = headerRow.map((value, index) =>
    index === 0 ? value.replace(/^\uFEFF/, "") : value,
  );
  const required = requiredHeaders[tableName] ?? [];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length)
    throw new Error(
      `CVM FRE ${tableName} CSV is missing required columns: ${missing.join(", ")}`,
    );
  let rowCount = 0;
  rows.forEach((values, index) => {
    rowCount += 1;
    const row = Object.fromEntries(
      values.map((value, column) => [headers[column] ?? "", value]),
    );
    consume(row, index + 2);
  });
  return rowCount;
}

function sourceKind(fileName: string) {
  const stem = fileName.match(/fre_cia_aberta_(.+)_\d{4}\.csv$/i)?.[1];
  return stem && stem in freTables
    ? freTables[stem as keyof typeof freTables]
    : null;
}

function positiveDocumentVersion(row: CsvRow) {
  return parseInteger(row.VERSAO ?? row.Versao);
}

function safeFields(row: CsvRow, kind: CvmShareCapitalRecordKind) {
  if (kind === "SHAREHOLDER_POSITION") {
    const shareholder = row.Acionista?.trim();
    if (
      shareholder
        ?.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase() !== "ACOES TESOURARIA"
    )
      return null;
    return {
      Acionista: shareholder,
      Quantidade_Acao_Ordinaria_Circulacao:
        row.Quantidade_Acao_Ordinaria_Circulacao ?? "",
      Percentual_Acao_Ordinaria_Circulacao:
        row.Percentual_Acao_Ordinaria_Circulacao ?? "",
      Quantidade_Acao_Preferencial_Circulacao:
        row.Quantidade_Acao_Preferencial_Circulacao ?? "",
      Percentual_Acao_Preferencial_Circulacao:
        row.Percentual_Acao_Preferencial_Circulacao ?? "",
      Quantidade_Total_Acoes_Circulacao:
        row.Quantidade_Total_Acoes_Circulacao ?? "",
      Percentual_Total_Acoes_Circulacao:
        row.Percentual_Total_Acoes_Circulacao ?? "",
      Data_Composicao_Capital_Social: row.Data_Composicao_Capital_Social ?? "",
      Data_Ultima_Alteracao: row.Data_Ultima_Alteracao ?? "",
    };
  }
  if (kind === "SHAREHOLDER_POSITION_CLASS")
    return {
      ID_Acionista: row.ID_Acionista ?? "",
      Tipo_Classe_Acao_Preferencial: row.Tipo_Classe_Acao_Preferencial ?? "",
      Quantidade_Acoes: row.Quantidade_Acoes ?? "",
      Percentual_Acoes: row.Percentual_Acoes ?? "",
    };
  return row;
}

function quantitySemantics(
  kind: CvmShareCapitalRecordKind,
  rawFields: Record<string, string>,
) {
  if (kind === "CAPITAL_DISTRIBUTION" || kind === "CAPITAL_DISTRIBUTION_CLASS")
    return "REPORTED_FREE_FLOAT_NOT_TOTAL_OUTSTANDING";
  if (kind === "TREASURY_POSITION")
    return "REPORTED_TREASURY_HOLDING_UNRECONCILED";
  if (kind === "CONVERTIBLE_SECURITY_DESCRIPTION")
    return "DESCRIPTION_ONLY_NOT_EXERCISE_EVIDENCE";
  if (kind === "CAPITAL_SOCIAL" || kind === "CAPITAL_SOCIAL_CLASS")
    return "REPORTED_CAPITAL_NOT_CURRENT_OUTSTANDING";
  return "REPORTED_SHAREHOLDER_POSITION_NOT_CLASS_MAPPING";
}

function recordFactKey(
  archive: string,
  sourceFile: string,
  rowNumber: number,
  row: CsvRow,
) {
  return createHash("sha256")
    .update([archive, sourceFile, rowNumber, documentKey(row)].join("|"))
    .digest("hex");
}

export function parseCvmFreArchive(
  response: Response,
  year: number,
  knownIssuerCnpjs: ReadonlySet<string>,
  fetchedAt = new Date(),
) {
  if (!response.ok)
    throw new Error(`CVM FRE request failed: ${response.status}`);
  if (!response.body) throw new Error("CVM FRE response has no body");

  const sourceArchive = `fre_cia_aberta_${year}.zip`;
  const allRows = new Map<string, { row: CsvRow; rowNumber: number }[]>();
  const metadata = new Map<DocumentKey, Metadata>();
  const seenTables = new Set<string>();
  const diagnostics: CvmShareCapitalDiagnostics = {
    archiveYear: year,
    sourceArchive,
    filesRead: 0,
    rowsRead: 0,
    records: 0,
    documentsMatched: 0,
    documentsWithoutMetadata: 0,
    ambiguousDocuments: 0,
    treasuryPositionRecords: 0,
    ingestionStatus: "PARTIAL",
    unavailableCoverageReasons: [],
    unsupportedEventTables: [
      "capital_increase_reduction",
      "stock_split_reverse_split_bonus",
      "treasury_movement",
      "convertible_exercise",
    ],
  };

  const unzip = new Unzip();
  unzip.register(UnzipInflate);

  return new Promise<{
    records: CvmShareCapitalRecord[];
    diagnostics: CvmShareCapitalDiagnostics;
  }>((resolve, reject) => {
    let readerDone = false;
    let activeFiles = 0;
    let settled = false;
    const settle = () => {
      if (settled || !readerDone || activeFiles > 0) return;
      settled = true;
      const missingTables = Object.keys(freTables).filter(
        (table) => !seenTables.has(table),
      );
      if (!seenTables.has("metadata")) missingTables.unshift("metadata");
      if (missingTables.length) {
        reject(
          new Error(
            `CVM FRE archive is missing required tables: ${missingTables.join(", ")}`,
          ),
        );
        return;
      }
      for (const [key, { row }] of (allRows.get("metadata") ?? []).map(
        ({ row }) => [documentKey(row), { row }] as const,
      )) {
        const existing = metadata.get(key);
        const receivedDate = row.DT_RECEB ?? "";
        metadata.set(key, {
          receivedDate: existing?.receivedDate || receivedDate,
          recordCount: (existing?.recordCount ?? 0) + 1,
        });
      }
      const records: CvmShareCapitalRecord[] = [];
      const matchedDocuments = new Set<DocumentKey>();
      const documentsWithoutMetadata = new Set<DocumentKey>();
      const ambiguousDocuments = new Set<DocumentKey>();
      for (const [fileName, fileRows] of allRows) {
        if (fileName === "metadata") continue;
        const kind = sourceKind(fileName);
        if (!kind) continue;
        for (const { row, rowNumber } of fileRows) {
          const issuerCnpj = normalizeCnpj(
            row.CNPJ_CIA ?? row.CNPJ_Companhia ?? "",
          );
          if (!knownIssuerCnpjs.has(issuerCnpj)) continue;
          const fields = safeFields(row, kind);
          if (!fields) continue;
          const recordKind =
            kind === "SHAREHOLDER_POSITION" &&
            fields.Acionista?.normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toUpperCase() === "ACOES TESOURARIA"
              ? "TREASURY_POSITION"
              : kind;
          const key = documentKey(row);
          const documentMetadata = metadata.get(key);
          const metadataStatus = !documentMetadata
            ? "UNAVAILABLE"
            : documentMetadata.recordCount === 1
              ? "MATCHED"
              : "AMBIGUOUS";
          if (metadataStatus === "MATCHED") matchedDocuments.add(key);
          else if (metadataStatus === "UNAVAILABLE")
            documentsWithoutMetadata.add(key);
          else ambiguousDocuments.add(key);
          if (recordKind === "TREASURY_POSITION")
            diagnostics.treasuryPositionRecords += 1;
          diagnostics.records += 1;
          records.push({
            factKey: recordFactKey(sourceArchive, fileName, rowNumber, row),
            issuerCnpj,
            referenceDate: (row.DT_REFER ?? row.Data_Referencia ?? "") || null,
            documentVersion: positiveDocumentVersion(row) ?? 0,
            documentId: row.ID_DOC ?? row.ID_Documento ?? "",
            documentReceivedDate:
              metadataStatus === "MATCHED"
                ? documentMetadata?.receivedDate || null
                : null,
            metadataStatus,
            recordKind,
            capitalId: row.ID_Capital_Social ?? null,
            shareholderId: row.ID_Acionista ?? null,
            sourceArchive,
            sourceFile: fileName,
            sourceRow: rowNumber,
            rawFields: fields,
            tickerClassStatus: "UNAVAILABLE",
            quantitySemantics: quantitySemantics(recordKind, fields),
            fetchedAt: fetchedAt.toISOString(),
          });
        }
      }
      diagnostics.documentsMatched = matchedDocuments.size;
      diagnostics.documentsWithoutMetadata = documentsWithoutMetadata.size;
      diagnostics.ambiguousDocuments = ambiguousDocuments.size;
      if (diagnostics.treasuryPositionRecords === 0)
        diagnostics.unavailableCoverageReasons.push(
          "No explicit Ações Tesouraria position was reported for the matched issuers; treasury balance is unavailable.",
        );
      if (diagnostics.unsupportedEventTables.length)
        diagnostics.unavailableCoverageReasons.push(
          "The current FRE archive does not provide structured historical capital events or treasury movements.",
        );
      diagnostics.ingestionStatus =
        diagnostics.unavailableCoverageReasons.length === 0
          ? "COMPLETED"
          : "PARTIAL";
      resolve({ records, diagnostics });
    };

    unzip.onfile = (file) => {
      const kind = sourceKind(file.name);
      const isMetadata = file.name === `fre_cia_aberta_${year}.csv`;
      if (!kind && !isMetadata) {
        file.ondata = () => undefined;
        file.start();
        return;
      }
      activeFiles += 1;
      diagnostics.filesRead += 1;
      const tableName = isMetadata
        ? "metadata"
        : (file.name.match(/fre_cia_aberta_(.+)_\d{4}\.csv$/i)?.[1] ??
          "unknown");
      seenTables.add(tableName);
      const chunks: Uint8Array[] = [];
      file.ondata = (error, data, final) => {
        if (settled) return;
        if (error) {
          settled = true;
          reject(error);
          return;
        }
        chunks.push(data);
        if (!final) return;
        const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
        const contents = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          contents.set(chunk, offset);
          offset += chunk.length;
        }
        let rowCount: number;
        try {
          rowCount = rowsFromCsv(contents, tableName, (row, rowNumber) => {
            if (isMetadata) {
              const issuerCnpj = normalizeCnpj(row.CNPJ_CIA ?? "");
              if (!knownIssuerCnpjs.has(issuerCnpj)) return;
            } else {
              const issuerCnpj = normalizeCnpj(
                row.CNPJ_CIA ?? row.CNPJ_Companhia ?? "",
              );
              if (!knownIssuerCnpjs.has(issuerCnpj)) return;
            }
            const tableKey = isMetadata ? "metadata" : file.name;
            const rows = allRows.get(tableKey) ?? [];
            rows.push({ row, rowNumber });
            allRows.set(tableKey, rows);
          });
        } catch (error) {
          settled = true;
          reject(error);
          return;
        }
        diagnostics.rowsRead += rowCount;
        activeFiles -= 1;
        settle();
      };
      file.start();
    };

    const run = async () => {
      try {
        const reader = response.body!.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          unzip.push(value, false);
        }
        unzip.push(new Uint8Array(), true);
        readerDone = true;
        settle();
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    };
    void run();
  });
}

export class CvmShareCapitalProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async getAnnualFacts(
    year: number,
    knownIssuerCnpjs: ReadonlySet<string>,
    fetchedAt = new Date(),
  ) {
    const url = `${cvmFreBaseUrl}/fre_cia_aberta_${year}.zip`;
    return parseCvmFreArchive(
      await this.fetcher(url),
      year,
      knownIssuerCnpjs,
      fetchedAt,
    );
  }
}

export const cvmShareCapitalProvider = new CvmShareCapitalProvider();

export const cvmShareCapitalProviderInternals = {
  parseInteger,
  sourceKind,
  documentKey,
};
