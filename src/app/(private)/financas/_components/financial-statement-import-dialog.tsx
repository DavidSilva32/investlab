"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { FinancialCategoryPicker } from "@/app/(private)/financas/_components/financial-category-picker";
import type { ParsedStatementRow } from "@/backend/services/financial-statement-import-parser";

type Kind = "INCOME" | "EXPENSE";
type Category = {
  id: string;
  kind: Kind;
  name: string;
  active: boolean;
};
type PreviewResponse = {
  hash: string;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  accountAliases?: string[];
  rows: Array<
    ParsedStatementRow & {
      alreadyImported?: boolean;
      categoryId?: string | null;
      categorySource?: "saved" | "suggested" | null;
      possibleDuplicate: boolean;
      possibleDuplicateAccountAliases?: string[];
      accountDuplicateCandidates?: Array<{
        entryId: string;
        accountAlias: string;
      }>;
      manualDuplicateCandidates?: Array<{ id: string; description: string }>;
      reversalReview?: boolean;
    }
  >;
};
type ReviewRow = ParsedStatementRow & {
  alreadyImported?: boolean;
  possibleDuplicate: boolean;
  possibleDuplicateAccountAliases: string[];
  accountDuplicateCandidates: Array<{ entryId: string; accountAlias: string }>;
  accountDuplicateEntryId: string;
  manualDuplicateCandidates: Array<{ id: string; description: string }>;
  manualDuplicateEntryId: string;
  confirmedDistinct: boolean;
  reversalReview: boolean;
  categoryId: string;
  categorySource?: "saved" | "suggested";
  included: boolean;
};
function toIsoDate(value: string | null) {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!parts) return null;
  const day = Number(parts[1]);
  const month = Number(parts[2]);
  const year = Number(parts[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${parts[3]}-${parts[2]}-${parts[1]}`
    : null;
}

function formatDateForDisplay(value: string | null) {
  if (!value) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value;
}

function applyDateMask(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

async function postPreview(file: File) {
  const form = new FormData();
  form.set("file", file);
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
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [rememberCategories, setRememberCategories] = useState(true);
  const [accountAlias, setAccountAlias] = useState("");
  const [loading, setLoading] = useState(false);

  const includedRows = useMemo(
    () => reviewRows.filter((row) => row.included),
    [reviewRows],
  );
  const matchesSelectedAccount = (row: ReviewRow) =>
    Boolean(
      accountAlias.trim() &&
      row.possibleDuplicateAccountAliases.some(
        (alias) =>
          alias.trim().toLocaleLowerCase("pt-BR") ===
          accountAlias.trim().toLocaleLowerCase("pt-BR"),
      ),
    );
  const requiresDuplicateReview = (row: ReviewRow) =>
    row.possibleDuplicate &&
    (!accountAlias.trim() || row.possibleDuplicateAccountAliases.includes(""));
  const invalidIncluded = includedRows.some(
    (row) =>
      row.errors.length ||
      !row.kind ||
      !row.actualDate ||
      !row.amount ||
      (!row.categoryId &&
        !row.alreadyImported &&
        !row.manualDuplicateEntryId &&
        !row.accountDuplicateEntryId &&
        !matchesSelectedAccount(row)) ||
      (requiresDuplicateReview(row) &&
        !row.confirmedDistinct &&
        !row.accountDuplicateEntryId) ||
      (Boolean(row.accountDuplicateEntryId) && !accountAlias.trim()) ||
      (row.manualDuplicateCandidates.length > 0 &&
        !row.manualDuplicateEntryId &&
        !row.confirmedDistinct),
  );
  const duplicateCount = reviewRows.filter(
    (row) =>
      requiresDuplicateReview(row) ||
      row.alreadyImported ||
      row.manualDuplicateCandidates.length > 0 ||
      row.reversalReview,
  ).length;
  const rowsForReview = reviewRows.filter((row) => !row.alreadyImported);
  const classifiedAutomaticallyCount = includedRows.filter(
    (row) =>
      row.categorySource === "saved" || row.categorySource === "suggested",
  ).length;
  const needsCategoryCount = includedRows.filter(
    (row) => row.kind && !row.categoryId && !row.alreadyImported,
  ).length;
  const activeCategories = categories.filter((category) => category.active);
  const reset = () => {
    requestGeneration.current += 1;
    setFile(null);
    setPreview(null);
    setReviewRows([]);
    setRememberCategories(true);
    setAccountAlias("");
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
      setReviewRows(
        result.rows.map((row) => ({
          ...row,
          categoryId: row.categoryId ?? "",
          categorySource: row.categorySource ?? undefined,
          possibleDuplicateAccountAliases:
            row.possibleDuplicateAccountAliases ?? [],
          accountDuplicateCandidates: row.accountDuplicateCandidates ?? [],
          accountDuplicateEntryId: "",
          manualDuplicateCandidates: row.manualDuplicateCandidates ?? [],
          manualDuplicateEntryId: "",
          confirmedDistinct: false,
          reversalReview: row.reversalReview ?? false,
          included: row.errors.length === 0,
        })),
      );
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

  const confirm = async (
    selectedFile: File,
    selectedPreview: PreviewResponse,
  ) => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    try {
      const result = await apiRequest<{ message?: string }>(
        "/api/financial-statement-import/confirm",
        {
          method: "POST",
          body: JSON.stringify({
            fileHash: selectedPreview.hash,
            coverageStart: selectedPreview.coverageStart ?? null,
            coverageEnd: selectedPreview.coverageEnd ?? null,
            accountAlias: accountAlias.trim() || null,
            rememberCategories,
            rows: includedRows.map((row) => ({
              sourceRow: row.sourceRow,
              kind: row.kind,
              description: row.description.trim(),
              categoryId: row.categoryId || null,
              manualDuplicateEntryId: row.manualDuplicateEntryId || null,
              accountDuplicateEntryId: row.accountDuplicateEntryId || null,
              confirmedDistinct: row.confirmedDistinct,
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
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  const normalizeDescription = (description: string) =>
    description.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
  const updateRow = (current: ReviewRow, patch: Partial<ReviewRow>) =>
    setReviewRows((rows) => {
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
        row.sourceRow === current.sourceRow
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
  const updateDate = (current: ReviewRow, value: string) => {
    const actualDate = applyDateMask(value);
    const dateError = "Confira a data informada.";
    updateRow(current, {
      actualDate,
      errors: [
        ...current.errors.filter(
          (message) => !message.startsWith("Confira a data"),
        ),
        ...(toIsoDate(actualDate) ? [] : [dateError]),
      ],
    });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        reset();
      }}
    >
      <DialogContent className="box-border max-h-[min(92dvh,56rem)] w-[calc(100vw-2rem)] min-w-0 max-w-6xl overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar extrato</DialogTitle>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          <label className="flex min-w-0 cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 text-sm hover:bg-muted/40 sm:flex-nowrap sm:p-4">
            <FileSpreadsheet className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 break-words">
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
            <span className="ml-auto shrink-0 text-primary">
              Selecionar arquivo
            </span>
          </label>
          {loading && (
            <p role="status" className="text-sm text-muted-foreground">
              Lendo e conferindo o arquivo…
            </p>
          )}
          {reviewRows.length > 0 && (
            <section className="space-y-3">
              <label className="block space-y-1 text-sm">
                Conta deste extrato
                <Input
                  value={accountAlias}
                  onChange={(event) => setAccountAlias(event.target.value)}
                  maxLength={80}
                  list="financial-statement-account-aliases"
                  placeholder="Ex.: Inter principal"
                  aria-label="Conta deste extrato"
                />
                <datalist id="financial-statement-account-aliases">
                  {(preview?.accountAliases ?? []).map((alias) => (
                    <option key={alias} value={alias} />
                  ))}
                </datalist>
              </label>
              <p className="text-xs text-muted-foreground">
                Use o extrato para os movimentos desta conta. Registre
                manualmente apenas dinheiro em espécie ou movimentos que não
                aparecem nele.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>
                  {includedRows.length} de {reviewRows.length} linhas
                  selecionadas · {classifiedAutomaticallyCount}{" "}
                  {classifiedAutomaticallyCount === 1
                    ? "classificada automaticamente"
                    : "classificadas automaticamente"}{" "}
                  · {needsCategoryCount}{" "}
                  {needsCategoryCount === 1 ? "pendente" : "pendentes"}
                  {duplicateCount > 0 && ` · ${duplicateCount} para revisar`}
                </p>
              </div>
              <div className="hidden max-h-[42vh] overflow-y-auto overflow-x-hidden rounded-md border lg:block">
                <table className="w-full table-fixed text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="w-12 p-2 text-left font-medium">
                        Importar
                      </th>
                      <th className="w-[22%] p-2 text-left font-medium">
                        Descrição
                      </th>
                      <th className="w-28 p-2 text-left font-medium">Tipo</th>
                      <th className="w-32 p-2 text-left font-medium">Data</th>
                      <th className="w-28 p-2 text-left font-medium">Valor</th>
                      <th className="w-48 p-2 text-left font-medium">
                        Categoria
                      </th>
                      <th className="p-2 text-left font-medium">Revisão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsForReview.map((row) => {
                      const rowErrors = [...row.errors];
                      if (
                        row.included &&
                        !row.categoryId &&
                        !row.manualDuplicateEntryId &&
                        !row.accountDuplicateEntryId
                      )
                        rowErrors.push("Escolha uma categoria.");
                      if (
                        row.included &&
                        requiresDuplicateReview(row) &&
                        !row.confirmedDistinct &&
                        !row.accountDuplicateEntryId
                      )
                        rowErrors.push(
                          "Confirme que é um movimento diferente ou desmarque para não importar.",
                        );
                      if (
                        row.included &&
                        row.accountDuplicateEntryId &&
                        !accountAlias.trim()
                      )
                        rowErrors.push(
                          "Informe a conta deste extrato para vincular a movimentação.",
                        );
                      const compatibleCategories = activeCategories.filter(
                        (category) => category.kind === row.kind,
                      );
                      return (
                        <tr key={row.sourceRow} className="border-t align-top">
                          <td className="p-2">
                            <Checkbox
                              checked={row.included}
                              onCheckedChange={(checked) =>
                                updateRow(row, {
                                  included: checked === true,
                                })
                              }
                              aria-label={`Importar linha ${row.sourceRow}`}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              value={row.description}
                              onChange={(event) => {
                                const description = event.target.value;
                                updateRow(row, {
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
                              onValueChange={(value: Kind) =>
                                updateRow(row, {
                                  kind: value,
                                  errors: row.errors.filter(
                                    (message) =>
                                      !message.includes("débito ou crédito") &&
                                      !message.includes("débito e crédito") &&
                                      !message.includes(
                                        "tipo deste lançamento",
                                      ) &&
                                      !message.includes(
                                        "pode ser pagamento de fatura",
                                      ),
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
                                <SelectItem value="INCOME">Entrada</SelectItem>
                                <SelectItem value="EXPENSE">Saída</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Input
                              value={formatDateForDisplay(row.actualDate)}
                              placeholder="dd/mm/aaaa"
                              onChange={(event) =>
                                updateDate(row, event.target.value)
                              }
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
                                updateRow(row, {
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
                          <td className="p-2">
                            <FinancialCategoryPicker
                              label={`Categoria da linha ${row.sourceRow}`}
                              categories={compatibleCategories}
                              value={row.categoryId}
                              onValueChange={(value) =>
                                updateRow(row, { categoryId: value })
                              }
                              disabled={!row.kind}
                              placeholder="Selecione"
                            />
                          </td>
                          <td className="break-words p-2 text-xs">
                            {row.possibleDuplicate &&
                              matchesSelectedAccount(row) && (
                                <p className="mb-2 font-medium text-muted-foreground">
                                  Esta linha já existe nesta conta e será
                                  ignorada.
                                </p>
                              )}
                            {requiresDuplicateReview(row) && (
                              <div className="mb-2 space-y-1">
                                <p className="font-medium text-amber-700">
                                  Há um lançamento igual sem identificação
                                  segura da conta.
                                </p>
                                {row.manualDuplicateCandidates.length === 0 && (
                                  <Select
                                    value={
                                      row.confirmedDistinct
                                        ? "DISTINCT"
                                        : row.accountDuplicateEntryId
                                    }
                                    onValueChange={(value) =>
                                      updateRow(row, {
                                        accountDuplicateEntryId:
                                          value === "DISTINCT" ? "" : value,
                                        confirmedDistinct: value === "DISTINCT",
                                      })
                                    }
                                  >
                                    <SelectTrigger
                                      aria-label={`Revisão da duplicidade da linha ${row.sourceRow}`}
                                    >
                                      <SelectValue placeholder="Revise antes de importar" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {row.accountDuplicateCandidates.map(
                                        (candidate) => (
                                          <SelectItem
                                            key={candidate.entryId}
                                            value={candidate.entryId}
                                          >
                                            É a mesma movimentação sem conta
                                            identificada
                                          </SelectItem>
                                        ),
                                      )}
                                      <SelectItem value="DISTINCT">
                                        É um movimento diferente
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            )}
                            {row.manualDuplicateCandidates.length > 0 && (
                              <div className="mb-2 space-y-1">
                                <p className="font-medium text-amber-700">
                                  Pode ser um movimento manual já registrado.
                                </p>
                                <Select
                                  value={
                                    row.confirmedDistinct
                                      ? "DISTINCT"
                                      : row.manualDuplicateEntryId
                                  }
                                  onValueChange={(value) =>
                                    updateRow(row, {
                                      manualDuplicateEntryId:
                                        value === "DISTINCT" ? "" : value,
                                      confirmedDistinct: value === "DISTINCT",
                                    })
                                  }
                                >
                                  <SelectTrigger
                                    aria-label={`Possível duplicidade da linha ${row.sourceRow}`}
                                  >
                                    <SelectValue placeholder="Revise a possível duplicidade" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {row.manualDuplicateCandidates.map(
                                      (candidate) => (
                                        <SelectItem
                                          key={candidate.id}
                                          value={candidate.id}
                                        >
                                          É o mesmo: {candidate.description}
                                        </SelectItem>
                                      ),
                                    )}
                                    <SelectItem value="DISTINCT">
                                      São movimentos diferentes
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {row.reversalReview && (
                              <p className="mb-2 font-medium text-amber-700">
                                Possível estorno ou reembolso. Será salvo para
                                revisão, sem contar como renda.
                              </p>
                            )}
                            {rowErrors.map((message) => (
                              <p key={message} className="text-destructive">
                                {message}
                              </p>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="max-h-[42vh] space-y-3 overflow-y-auto overflow-x-hidden lg:hidden">
                {rowsForReview.map((row) => {
                  const rowErrors = [...row.errors];
                  if (
                    row.included &&
                    !row.categoryId &&
                    !row.manualDuplicateEntryId &&
                    !row.accountDuplicateEntryId
                  )
                    rowErrors.push("Escolha uma categoria.");
                  if (
                    row.included &&
                    requiresDuplicateReview(row) &&
                    !row.confirmedDistinct &&
                    !row.accountDuplicateEntryId
                  )
                    rowErrors.push(
                      "Confirme que é um movimento diferente ou desmarque para não importar.",
                    );
                  if (
                    row.included &&
                    row.accountDuplicateEntryId &&
                    !accountAlias.trim()
                  )
                    rowErrors.push(
                      "Informe a conta deste extrato para vincular a movimentação.",
                    );
                  const compatibleCategories = activeCategories.filter(
                    (category) => category.kind === row.kind,
                  );
                  return (
                    <article
                      key={row.sourceRow}
                      className="min-w-0 space-y-3 rounded-md border p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Checkbox
                          checked={row.included}
                          onCheckedChange={(checked) =>
                            updateRow(row, {
                              included: checked === true,
                            })
                          }
                          aria-label={`Importar linha ${row.sourceRow}`}
                        />
                        <p className="min-w-0 flex-1 text-sm font-medium">
                          Linha {row.sourceRow}
                        </p>
                      </div>
                      <label className="block space-y-1 text-xs text-muted-foreground">
                        Descrição
                        <Input
                          value={row.description}
                          onChange={(event) => {
                            const description = event.target.value;
                            updateRow(row, {
                              description,
                              errors:
                                description.trim() && description.length <= 120
                                  ? row.errors.filter(
                                      (message) =>
                                        message !== "Informe a descrição." &&
                                        message !==
                                          "A descrição deve ter até 120 caracteres.",
                                    )
                                  : row.errors,
                            });
                          }}
                          aria-label={`Descrição da linha ${row.sourceRow}`}
                        />
                      </label>
                      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
                          Tipo
                          <Select
                            value={row.kind ?? ""}
                            onValueChange={(value: Kind) =>
                              updateRow(row, {
                                kind: value,
                                errors: row.errors.filter(
                                  (message) =>
                                    !message.includes("débito ou crédito") &&
                                    !message.includes("débito e crédito") &&
                                    !message.includes(
                                      "tipo deste lançamento",
                                    ) &&
                                    !message.includes(
                                      "pode ser pagamento de fatura",
                                    ),
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
                              <SelectItem value="INCOME">Entrada</SelectItem>
                              <SelectItem value="EXPENSE">Saída</SelectItem>
                            </SelectContent>
                          </Select>
                        </label>
                        <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
                          Data
                          <Input
                            value={formatDateForDisplay(row.actualDate)}
                            placeholder="dd/mm/aaaa"
                            onChange={(event) =>
                              updateDate(row, event.target.value)
                            }
                            aria-label={`Data da linha ${row.sourceRow}`}
                          />
                        </label>
                        <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
                          Valor
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
                              updateRow(row, {
                                amount,
                                errors: amount
                                  ? row.errors.filter(
                                      (message) =>
                                        !message.startsWith(
                                          "Confira os valores de débito",
                                        ) &&
                                        !message.startsWith(
                                          "Confira o valor",
                                        ) &&
                                        !message.startsWith("O valor precisa"),
                                    )
                                  : row.errors,
                              });
                            }}
                            aria-label={`Valor da linha ${row.sourceRow}`}
                          />
                        </label>
                        <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
                          Categoria
                          <FinancialCategoryPicker
                            label={`Categoria da linha ${row.sourceRow}`}
                            categories={compatibleCategories}
                            value={row.categoryId}
                            onValueChange={(value) =>
                              updateRow(row, { categoryId: value })
                            }
                            disabled={!row.kind}
                            placeholder="Selecione"
                          />
                        </label>
                      </div>
                      {row.manualDuplicateCandidates.length > 0 && (
                        <label className="block space-y-1 text-xs text-muted-foreground">
                          Possível duplicidade
                          <Select
                            value={
                              row.confirmedDistinct
                                ? "DISTINCT"
                                : row.manualDuplicateEntryId
                            }
                            onValueChange={(value) =>
                              updateRow(row, {
                                manualDuplicateEntryId:
                                  value === "DISTINCT" ? "" : value,
                                confirmedDistinct: value === "DISTINCT",
                              })
                            }
                          >
                            <SelectTrigger
                              aria-label={`Possível duplicidade da linha ${row.sourceRow}`}
                            >
                              <SelectValue placeholder="Revise esta possibilidade" />
                            </SelectTrigger>
                            <SelectContent>
                              {row.manualDuplicateCandidates.map(
                                (candidate) => (
                                  <SelectItem
                                    key={candidate.id}
                                    value={candidate.id}
                                  >
                                    É o mesmo: {candidate.description}
                                  </SelectItem>
                                ),
                              )}
                              <SelectItem value="DISTINCT">
                                São movimentos diferentes
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </label>
                      )}
                      {requiresDuplicateReview(row) && (
                        <label className="block space-y-1 text-xs text-muted-foreground">
                          Há um lançamento igual sem identificação segura da
                          conta.
                          {row.manualDuplicateCandidates.length === 0 && (
                            <Select
                              value={
                                row.confirmedDistinct
                                  ? "DISTINCT"
                                  : row.accountDuplicateEntryId
                              }
                              onValueChange={(value) =>
                                updateRow(row, {
                                  accountDuplicateEntryId:
                                    value === "DISTINCT" ? "" : value,
                                  confirmedDistinct: value === "DISTINCT",
                                })
                              }
                            >
                              <SelectTrigger
                                aria-label={`Revisão da duplicidade da linha ${row.sourceRow}`}
                              >
                                <SelectValue placeholder="Revise antes de importar" />
                              </SelectTrigger>
                              <SelectContent>
                                {row.accountDuplicateCandidates.map(
                                  (candidate) => (
                                    <SelectItem
                                      key={candidate.entryId}
                                      value={candidate.entryId}
                                    >
                                      É a mesma movimentação sem conta
                                      identificada
                                    </SelectItem>
                                  ),
                                )}
                                <SelectItem value="DISTINCT">
                                  É um movimento diferente
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </label>
                      )}
                      {row.possibleDuplicate && matchesSelectedAccount(row) && (
                        <p className="mb-2 font-medium text-muted-foreground">
                          Esta linha já existe nesta conta e será ignorada.
                        </p>
                      )}
                      {rowErrors.map((message) => (
                        <p key={message} className="text-xs text-destructive">
                          {message}
                        </p>
                      ))}
                      {row.reversalReview && (
                        <p className="text-xs font-medium text-amber-700">
                          Possível estorno/reembolso. Não será renda até ser
                          conferido.
                        </p>
                      )}
                      {rowErrors.length > 0 && (
                        <div className="space-y-1 text-xs text-destructive">
                          {rowErrors.map((message) => (
                            <p key={message}>{message}</p>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <Checkbox
                  checked={rememberCategories}
                  onCheckedChange={(checked) =>
                    setRememberCategories(checked === true)
                  }
                />
                <span>
                  <span className="block font-medium">
                    Lembrar minhas categorias para próximos extratos
                  </span>
                </span>
              </label>
              {duplicateCount > 0 && (
                <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {duplicateCount === 1
                    ? "1 lançamento precisa de revisão antes da importação."
                    : `${duplicateCount} lançamentos precisam de revisão antes da importação.`}
                </p>
              )}
            </section>
          )}
        </div>
        <DialogFooter className="min-w-0 flex-wrap gap-2 sm:space-x-0">
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
              onClick={() => void confirm(file!, preview!)}
              disabled={loading || includedRows.length === 0 || invalidIncluded}
            >
              Confirmar importação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
