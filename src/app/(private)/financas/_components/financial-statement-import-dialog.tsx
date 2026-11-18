"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiMessage } from "@/lib/api-message";
import { apiRequest } from "@/lib/api-client";
import { toast } from "sonner";
import type {
  ParsedStatementRow,
  StatementColumnMapping,
  StatementRawRow,
} from "@/backend/services/financial-statement-import-parser";

type Category = {
  id: string;
  kind: "INCOME" | "EXPENSE";
  name: string;
  active: boolean;
};
type PreviewResponse = {
  hash: string;
  headers: string[];
  mapping: StatementColumnMapping | null;
  rows:
    | StatementRawRow[]
    | Array<
        ParsedStatementRow & {
          alreadyImported?: boolean;
          categoryId?: string | null;
          categorySource?: "saved" | null;
          possibleDuplicate: boolean;
        }
      >;
};
type ReviewRow = ParsedStatementRow & {
  alreadyImported?: boolean;
  possibleDuplicate: boolean;
  categoryId: string;
  categorySource?: "saved";
  included: boolean;
};
type MappingForm = {
  dateColumn: string;
  descriptionColumn: string;
  mode: "SIGNED" | "SEPARATE";
  amountColumn: string;
  debitColumn: string;
  creditColumn: string;
  dateFormat: StatementColumnMapping["dateFormat"];
  decimalSeparator: StatementColumnMapping["decimalSeparator"];
};

function suggestedIndex(headers: string[], tokens: string[]) {
  return String(
    headers.findIndex((header) =>
      tokens.some((token) => header.toLocaleLowerCase("pt-BR").includes(token)),
    ),
  );
}

function initialMapping(headers: string[]): MappingForm {
  const dateColumn = suggestedIndex(headers, ["data", "date"]);
  const descriptionColumn = suggestedIndex(headers, [
    "descri",
    "histórico",
    "historico",
    "description",
    "memo",
  ]);
  const amountColumn = suggestedIndex(headers, ["valor", "amount", "montante"]);
  const debitColumn = suggestedIndex(headers, ["débito", "debito", "debit"]);
  const creditColumn = suggestedIndex(headers, [
    "crédito",
    "credito",
    "credit",
  ]);
  const separate =
    debitColumn !== "-1" && creditColumn !== "-1" && amountColumn === "-1";
  return {
    dateColumn: dateColumn === "-1" ? "" : dateColumn,
    descriptionColumn: descriptionColumn === "-1" ? "" : descriptionColumn,
    mode: separate ? "SEPARATE" : "SIGNED",
    amountColumn: amountColumn === "-1" ? "" : amountColumn,
    debitColumn: debitColumn === "-1" ? "" : debitColumn,
    creditColumn: creditColumn === "-1" ? "" : creditColumn,
    dateFormat: "DMY",
    decimalSeparator: "COMMA",
  };
}

function mapPayload(mapping: MappingForm): StatementColumnMapping | null {
  if (mapping.dateColumn === "" || mapping.descriptionColumn === "")
    return null;
  const distinct = (values: string[]) => new Set(values).size === values.length;
  if (mapping.mode === "SIGNED" && mapping.amountColumn !== "") {
    if (
      !distinct([
        mapping.dateColumn,
        mapping.descriptionColumn,
        mapping.amountColumn,
      ])
    )
      return null;
    return {
      dateColumn: Number(mapping.dateColumn),
      descriptionColumn: Number(mapping.descriptionColumn),
      amountColumn: Number(mapping.amountColumn),
      dateFormat: mapping.dateFormat,
      decimalSeparator: mapping.decimalSeparator,
    };
  }
  if (
    mapping.mode === "SEPARATE" &&
    mapping.debitColumn !== "" &&
    mapping.creditColumn !== ""
  ) {
    if (
      !distinct([
        mapping.dateColumn,
        mapping.descriptionColumn,
        mapping.debitColumn,
        mapping.creditColumn,
      ])
    )
      return null;
    return {
      dateColumn: Number(mapping.dateColumn),
      descriptionColumn: Number(mapping.descriptionColumn),
      debitColumn: Number(mapping.debitColumn),
      creditColumn: Number(mapping.creditColumn),
      dateFormat: mapping.dateFormat,
      decimalSeparator: mapping.decimalSeparator,
    };
  }
  return null;
}

function toIsoDate(value: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  return parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : null;
}

async function postPreview(file: File, mapping?: StatementColumnMapping) {
  const form = new FormData();
  form.set("file", file);
  if (mapping) form.set("mapping", JSON.stringify(mapping));
  const response = await fetch("/api/financial-statement-import/preview", {
    method: "POST",
    body: form,
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok)
    throw new Error(getApiMessage(body, "Não foi possível ler o extrato."));
  return body as PreviewResponse;
}

export function FinancialStatementImportDialog({
  open,
  onOpenChange,
  categories,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onImported: () => void;
}) {
  const requestGeneration = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<MappingForm | null>(null);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [rememberCategories, setRememberCategories] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const includedRows = useMemo(
    () => reviewRows.filter((row) => row.included),
    [reviewRows],
  );
  const invalidIncluded = includedRows.some(
    (row) =>
      row.errors.length ||
      !row.kind ||
      !row.actualDate ||
      !row.amount ||
      !row.categoryId,
  );
  const duplicateCount = includedRows.filter(
    (row) => row.possibleDuplicate,
  ).length;
  const activeCategories = categories.filter((category) => category.active);

  const reset = () => {
    requestGeneration.current += 1;
    setFile(null);
    setPreview(null);
    setMapping(null);
    setReviewRows([]);
    setAllowDuplicates(false);
    setRememberCategories(true);
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    if (open) return;
    requestGeneration.current += 1;
  }, [open]);

  const chooseFile = async (selected: File | null) => {
    reset();
    if (!selected) return;
    const generation = ++requestGeneration.current;
    setFile(selected);
    setLoading(true);
    try {
      const result = await postPreview(selected);
      if (generation !== requestGeneration.current) return;
      setPreview(result);
      if (result.mapping && result.rows.length && "errors" in result.rows[0]) {
        setReviewRows(
          (
            result.rows as Array<
              ParsedStatementRow & {
                alreadyImported?: boolean;
                categoryId?: string | null;
                categorySource?: "saved" | null;
                possibleDuplicate: boolean;
              }
            >
          ).map((row) => ({
            ...row,
            categoryId: row.categoryId ?? "",
            categorySource: row.categorySource ?? undefined,
            included: row.errors.length === 0,
          })),
        );
        setMapping({
          ...initialMapping(result.headers),
          dateColumn: String(result.mapping.dateColumn),
          descriptionColumn: String(result.mapping.descriptionColumn),
          mode:
            result.mapping.amountColumn !== undefined ? "SIGNED" : "SEPARATE",
          amountColumn:
            result.mapping.amountColumn === undefined
              ? ""
              : String(result.mapping.amountColumn),
          debitColumn:
            result.mapping.debitColumn === undefined
              ? ""
              : String(result.mapping.debitColumn),
          creditColumn:
            result.mapping.creditColumn === undefined
              ? ""
              : String(result.mapping.creditColumn),
          dateFormat: result.mapping.dateFormat,
          decimalSeparator: result.mapping.decimalSeparator,
        });
      } else {
        setMapping(initialMapping(result.headers));
      }
    } catch (caught) {
      if (generation !== requestGeneration.current) return;
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Não foi possível ler o extrato.",
      );
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  const analyze = async () => {
    if (!open || !file || !preview || !mapping) return;
    const selectedFile = file;
    const generation = ++requestGeneration.current;
    const payload = mapPayload(mapping);
    if (!payload) {
      setError("Selecione as colunas de data, descrição e valor.");
      return;
    }
    setLoading(true);
    setError(null);
    setAllowDuplicates(false);
    try {
      const result = await postPreview(selectedFile, payload);
      if (generation !== requestGeneration.current) return;
      setPreview(result);
      setReviewRows(
        (
          result.rows as Array<
            ParsedStatementRow & {
              alreadyImported?: boolean;
              categoryId?: string | null;
              categorySource?: "saved" | null;
              possibleDuplicate: boolean;
            }
          >
        ).map((row) => ({
          ...row,
          categoryId: row.categoryId ?? "",
          categorySource: row.categorySource ?? undefined,
          included: row.errors.length === 0,
        })),
      );
    } catch (caught) {
      if (generation !== requestGeneration.current) return;
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Não foi possível preparar a prévia.",
      );
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  const confirm = async () => {
    if (
      !open ||
      !file ||
      !preview ||
      invalidIncluded ||
      (duplicateCount > 0 && !allowDuplicates)
    )
      return;
    const selectedFile = file;
    const selectedPreview = preview;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ message?: string }>(
        "/api/financial-statement-import/confirm",
        {
          method: "POST",
          body: JSON.stringify({
            fileHash: preview.hash,
            allowPossibleDuplicates: allowDuplicates,
            rememberCategories,
            rows: includedRows.map((row) => ({
              sourceRow: row.sourceRow,
              kind: row.kind,
              description: row.description.trim(),
              categoryId: row.categoryId,
              actualDate: toIsoDate(row.actualDate),
              actualAmount: Number(String(row.amount).replace(",", ".")),
            })),
          }),
        },
      );
      if (
        generation !== requestGeneration.current ||
        selectedFile !== file ||
        selectedPreview !== preview
      )
        return;
      toast.success(result.message || "Importação concluída.");
      onImported();
      onOpenChange(false);
      reset();
    } catch (caught) {
      if (
        generation !== requestGeneration.current ||
        selectedFile !== file ||
        selectedPreview !== preview
      )
        return;
      const message =
        caught instanceof Error
          ? caught.message
          : "Não foi possível concluir a importação.";
      toast.error(message);
      const payload = mapping ? mapPayload(mapping) : null;
      if (message.startsWith("Há possíveis duplicidades.") && payload) {
        try {
          const refreshed = await postPreview(selectedFile, payload);
          if (
            generation !== requestGeneration.current ||
            selectedFile !== file ||
            selectedPreview !== preview
          )
            return;
          setReviewRows((rows) =>
            rows.map((row) => {
              const fresh = (
                refreshed.rows as Array<
                  ParsedStatementRow & {
                    alreadyImported?: boolean;
                    possibleDuplicate: boolean;
                  }
                >
              ).find((item) => item.sourceRow === row.sourceRow);
              return fresh
                ? {
                    ...row,
                    possibleDuplicate: fresh.possibleDuplicate,
                    alreadyImported: fresh.alreadyImported,
                  }
                : row;
            }),
          );
        } catch {
          /* The original confirmation error remains actionable. */
        }
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  const normalizeDescription = (description: string) =>
    description.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
  const updateRow = (sourceRow: number, patch: Partial<ReviewRow>) =>
    setReviewRows((rows) => {
      const current = rows.find((row) => row.sourceRow === sourceRow);
      if (!current) return rows;
      if (patch.categoryId !== undefined && current.kind) {
        const descriptionKey = normalizeDescription(current.description);
        return rows.map((row) =>
          row.kind === current.kind &&
          normalizeDescription(row.description) === descriptionKey
            ? {
                ...row,
                categoryId: patch.categoryId!,
                categorySource: undefined,
              }
            : row,
        );
      }
      return rows.map((row) =>
        row.sourceRow === sourceRow
          ? {
              ...row,
              ...patch,
              ...(patch.description !== undefined || patch.kind !== undefined
                ? { categoryId: "", categorySource: undefined }
                : {}),
            }
          : row,
      );
    });
  const options =
    preview?.headers.map((header, index) => ({
      value: String(index),
      label: header,
    })) ?? [];
  const columnSelect = (
    value: string,
    onChange: (value: string) => void,
    label: string,
    allowEmpty = false,
  ) => (
    <Select
      value={value || (allowEmpty ? "-1" : undefined)}
      onValueChange={(selected) => onChange(selected === "-1" ? "" : selected)}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder="Selecione uma coluna" />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="-1">Selecione uma coluna</SelectItem>}
        {options.map((option) => (
          <SelectItem key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar extrato</DialogTitle>
          <DialogDescription>
            Confira as colunas e revise cada lançamento antes de adicionar ao
            seu fluxo financeiro.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 text-sm hover:bg-muted/40">
            <FileSpreadsheet className="size-5 text-primary" />
            <span className="min-w-0 flex-1">
              {file?.name ??
                "Escolha um arquivo CSV, XLS ou XLSX (até 5 MB e 500 linhas)."}
            </span>
            <Input
              type="file"
              accept=".csv,.xls,.xlsx"
              aria-label="Selecionar extrato CSV, XLS ou XLSX"
              className="sr-only"
              onChange={(event) =>
                void chooseFile(event.target.files?.[0] ?? null)
              }
            />
            <span className="text-primary">Selecionar arquivo</span>
          </label>
          <p className="text-xs text-muted-foreground">
            O arquivo é processado para criar a prévia e não é guardado. Só os
            lançamentos confirmados, uma referência técnica para evitar
            reimportação e, se você mantiver a opção ativa, suas escolhas de
            categoria são salvos.
          </p>
          {loading && (
            <p role="status" className="text-sm text-muted-foreground">
              Lendo e conferindo o arquivo…
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {preview && reviewRows.length === 0 && mapping && (
            <section className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
              <h3 className="md:col-span-2 font-medium">
                Como identificar as colunas?
              </h3>
              <label className="space-y-1 text-sm">
                Data{" "}
                {columnSelect(
                  mapping.dateColumn,
                  (value) => setMapping({ ...mapping, dateColumn: value }),
                  "Coluna de data",
                )}
              </label>
              <label className="space-y-1 text-sm">
                Descrição{" "}
                {columnSelect(
                  mapping.descriptionColumn,
                  (value) =>
                    setMapping({ ...mapping, descriptionColumn: value }),
                  "Coluna de descrição",
                )}
              </label>
              <label className="space-y-1 text-sm">
                Formato de data
                <Select
                  value={mapping.dateFormat}
                  onValueChange={(
                    value: StatementColumnMapping["dateFormat"],
                  ) => setMapping({ ...mapping, dateFormat: value })}
                >
                  <SelectTrigger aria-label="Formato de data">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DMY">Dia/mês/ano</SelectItem>
                    <SelectItem value="MDY">Mês/dia/ano</SelectItem>
                    <SelectItem value="ISO">Ano-mês-dia</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                Separador decimal
                <Select
                  value={mapping.decimalSeparator}
                  onValueChange={(
                    value: StatementColumnMapping["decimalSeparator"],
                  ) => setMapping({ ...mapping, decimalSeparator: value })}
                >
                  <SelectTrigger aria-label="Separador decimal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMMA">Vírgula (1.234,56)</SelectItem>
                    <SelectItem value="DOT">Ponto (1,234.56)</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                Formato dos valores
                <Select
                  value={mapping.mode}
                  onValueChange={(value: MappingForm["mode"]) =>
                    setMapping({ ...mapping, mode: value })
                  }
                >
                  <SelectTrigger aria-label="Formato dos valores">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SIGNED">
                      Uma coluna com valores positivos e negativos
                    </SelectItem>
                    <SelectItem value="SEPARATE">
                      Colunas separadas de débito e crédito
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {mapping.mode === "SIGNED" ? (
                <label className="space-y-1 text-sm md:col-span-2">
                  Valor{" "}
                  {columnSelect(
                    mapping.amountColumn,
                    (value) => setMapping({ ...mapping, amountColumn: value }),
                    "Coluna de valor",
                  )}
                </label>
              ) : (
                <>
                  <label className="space-y-1 text-sm">
                    Débito{" "}
                    {columnSelect(
                      mapping.debitColumn,
                      (value) => setMapping({ ...mapping, debitColumn: value }),
                      "Coluna de débito",
                    )}
                  </label>
                  <label className="space-y-1 text-sm">
                    Crédito{" "}
                    {columnSelect(
                      mapping.creditColumn,
                      (value) =>
                        setMapping({ ...mapping, creditColumn: value }),
                      "Coluna de crédito",
                    )}
                  </label>
                </>
              )}
              <div className="md:col-span-2">
                <Button
                  onClick={() => void analyze()}
                  disabled={loading || !mapPayload(mapping)}
                >
                  <Upload className="mr-2 size-4" />
                  Montar prévia
                </Button>
              </div>
            </section>
          )}
          {reviewRows.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>
                  {includedRows.length} de {reviewRows.length} linhas
                  selecionadas para importar.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReviewRows([]);
                    setMapping(initialMapping(preview?.headers ?? []));
                  }}
                >
                  Alterar colunas
                </Button>
              </div>
              <div className="max-h-[42vh] overflow-auto rounded-md border">
                <table className="w-full min-w-[850px] text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      {[
                        "Importar",
                        "Descrição",
                        "Tipo",
                        "Data",
                        "Valor",
                        "Categoria",
                        "Revisão",
                      ].map((heading) => (
                        <th key={heading} className="p-2 text-left font-medium">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRows.map((row) => {
                      const rowErrors = [...row.errors];
                      if (row.included && !row.categoryId)
                        rowErrors.push("Escolha uma categoria.");
                      const compatibleCategories = activeCategories.filter(
                        (category) => category.kind === row.kind,
                      );
                      return (
                        <tr key={row.sourceRow} className="border-t align-top">
                          <td className="p-2">
                            <Checkbox
                              checked={row.included}
                              onCheckedChange={(checked) =>
                                updateRow(row.sourceRow, {
                                  included: checked === true,
                                })
                              }
                              aria-label={`Importar linha ${row.sourceRow}`}
                            />
                          </td>
                          <td className="max-w-56 p-2">
                            <Input
                              value={row.description}
                              onChange={(event) => {
                                const description = event.target.value;
                                updateRow(row.sourceRow, {
                                  description,
                                  errors:
                                    description.trim() &&
                                    description.length <= 120
                                      ? row.errors.filter(
                                          (message) =>
                                            message !==
                                              "Informe a descrição." &&
                                            message !==
                                              "A descrição deve ter até 120 caracteres.",
                                        )
                                      : row.errors,
                                });
                              }}
                              aria-label={`Descrição da linha ${row.sourceRow}`}
                            />
                          </td>
                          <td className="p-2">
                            <Select
                              value={row.kind ?? ""}
                              onValueChange={(value: "INCOME" | "EXPENSE") =>
                                updateRow(row.sourceRow, {
                                  kind: value,
                                  errors: row.errors.filter(
                                    (message) =>
                                      !message.includes("débito ou crédito") &&
                                      !message.includes("débito e crédito"),
                                  ),
                                })
                              }
                            >
                              <SelectTrigger
                                aria-label={`Tipo da linha ${row.sourceRow}`}
                              >
                                <SelectValue placeholder="Tipo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="INCOME">Receita</SelectItem>
                                <SelectItem value="EXPENSE">Despesa</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Input
                              value={row.actualDate ?? ""}
                              placeholder="dd/mm/aaaa"
                              onChange={(event) => {
                                const actualDate = event.target.value;
                                updateRow(row.sourceRow, {
                                  actualDate,
                                  errors: toIsoDate(actualDate)
                                    ? row.errors.filter(
                                        (message) =>
                                          !message.startsWith("Confira a data"),
                                      )
                                    : row.errors,
                                });
                              }}
                              aria-label={`Data da linha ${row.sourceRow}`}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              inputMode="decimal"
                              value={
                                row.amount === null ? "" : String(row.amount)
                              }
                              onChange={(event) => {
                                const value = Number(
                                  event.target.value.replace(",", "."),
                                );
                                const amount =
                                  event.target.value === "" ||
                                  !Number.isFinite(value) ||
                                  value <= 0
                                    ? null
                                    : Math.round(value * 100) / 100;
                                updateRow(row.sourceRow, {
                                  amount,
                                  errors: amount
                                    ? row.errors.filter((message) =>
                                        message.startsWith(
                                          "Confira os valores de débito",
                                        ) ||
                                        message.startsWith("Confira o valor") ||
                                        message.startsWith("O valor precisa")
                                          ? false
                                          : true,
                                      )
                                    : row.errors,
                                });
                              }}
                              aria-label={`Valor da linha ${row.sourceRow}`}
                            />
                          </td>
                          <td className="min-w-48 p-2">
                            <Select
                              value={row.categoryId}
                              onValueChange={(value) =>
                                updateRow(row.sourceRow, { categoryId: value })
                              }
                              disabled={!row.kind}
                            >
                              <SelectTrigger
                                aria-label={`Categoria da linha ${row.sourceRow}`}
                              >
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {compatibleCategories.map((category) => (
                                  <SelectItem
                                    key={category.id}
                                    value={category.id}
                                  >
                                    {category.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {row.categorySource === "saved" && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Categoria da sua escolha anterior
                              </p>
                            )}
                          </td>
                          <td className="max-w-60 p-2 text-xs">
                            {row.alreadyImported && (
                              <p className="mb-1 text-muted-foreground">
                                Este arquivo já foi importado; a linha será
                                ignorada.
                              </p>
                            )}
                            {row.possibleDuplicate && (
                              <p className="mb-1 flex items-center gap-1 text-amber-700">
                                <AlertTriangle className="size-3" />
                                Possível duplicidade
                              </p>
                            )}
                            {rowErrors.map((message) => (
                              <p key={message} className="text-destructive">
                                {message}
                              </p>
                            ))}
                            {row.possibleDuplicate && !rowErrors.length && (
                              <p className="text-muted-foreground">
                                Confira antes de importar.
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Se o extrato incluir compras individuais do cartão e o pagamento
                total da fatura, evite importar os dois como despesas: isso pode
                contar a mesma saída duas vezes.
              </p>
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <Checkbox
                  checked={rememberCategories}
                  onCheckedChange={(checked) =>
                    setRememberCategories(checked === true)
                  }
                />
                <span>
                  <span className="block font-medium">
                    Lembrar estas categorias nos próximos extratos
                  </span>
                  <span className="text-muted-foreground">
                    Só para a mesma descrição e tipo de lançamento; maiúsculas e
                    espaços extras são normalizados. Desmarque para não guardar
                    as escolhas deste arquivo.
                  </span>
                </span>
              </label>
              {duplicateCount > 0 && (
                <label className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  <Checkbox
                    checked={allowDuplicates}
                    onCheckedChange={(checked) =>
                      setAllowDuplicates(checked === true)
                    }
                  />
                  <span>
                    Revisei {duplicateCount} possível(is) duplicidade(s) e quero
                    importar mesmo assim.
                  </span>
                </label>
              )}
            </section>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          {reviewRows.length > 0 && (
            <Button
              type="button"
              onClick={() => void confirm()}
              disabled={
                loading ||
                includedRows.length === 0 ||
                invalidIncluded ||
                (duplicateCount > 0 && !allowDuplicates)
              }
            >
              Confirmar importação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
