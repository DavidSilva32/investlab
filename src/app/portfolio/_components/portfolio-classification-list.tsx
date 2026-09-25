"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

type Classification = {
  assetClass: string | null;
  subClass: string | null;
  geography: string | null;
};
export type PortfolioPosition = {
  id: string;
  product: string;
  institution: string | null;
  estimatedValue?: number | null;
  totalValue: string | null;
  classification: Classification;
  classificationSource: "manual" | "inferred" | "unclassified";
};
export type BulkClassification = {
  positionIds: string[];
  assetClass?: string | null;
  subClass?: string | null;
  geography?: string | null;
};
type BulkField = keyof Classification;

type Props = {
  positions: PortfolioPosition[];
  saving: boolean;
  onSave: (position: PortfolioPosition, formData: FormData) => Promise<boolean>;
  onSaveBulk: (input: BulkClassification) => Promise<boolean>;
};

const classOptions = [
  "Renda fixa",
  "Renda variável",
  "Fundos",
  "Criptoativos",
  "Imóveis",
  "Outros",
];
const geographyOptions = ["Brasil", "Exterior", "Global"];
const unknownLabel = "Não informado";
const unknownValue = "__not_informed__";
const noSelectionValue = "__select_value__";
const bulkFields: Array<{ key: BulkField; label: string }> = [
  { key: "assetClass", label: "Aplicar classe" },
  { key: "subClass", label: "Aplicar subclasse" },
  { key: "geography", label: "Aplicar geografia" },
];

function formatPositionValue(position: PortfolioPosition) {
  if (
    position.estimatedValue !== undefined &&
    position.estimatedValue !== null &&
    Number.isFinite(position.estimatedValue)
  ) {
    return formatCurrency(position.estimatedValue);
  }
  if (position.totalValue === null) return "Sem valor atual";
  const value = Number(position.totalValue);
  return Number.isFinite(value) ? formatCurrency(value) : "Sem valor atual";
}

export function PortfolioClassificationList({
  positions,
  saving,
  onSave,
  onSaveBulk,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [enabledBulkFields, setEnabledBulkFields] = useState<Set<BulkField>>(
    new Set(),
  );
  const [bulkAssetClass, setBulkAssetClass] = useState(noSelectionValue);
  const [bulkSubClass, setBulkSubClass] = useState("");
  const [bulkGeography, setBulkGeography] = useState(noSelectionValue);

  const visiblePositions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return positions.filter((position) =>
      `${position.product} ${position.institution ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(query),
    );
  }, [positions, search]);
  const selectedVisibleCount = visiblePositions.filter((position) =>
    selectedIds.has(position.id),
  ).length;
  const visibleSelectionState =
    selectedVisibleCount === visiblePositions.length &&
    visiblePositions.length > 0
      ? true
      : selectedVisibleCount > 0
        ? "indeterminate"
        : false;
  const selectedCount = selectedIds.size;

  function toggleSelected(positionId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(positionId);
      else next.delete(positionId);
      return next;
    });
  }

  function toggleVisibleSelection(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const position of visiblePositions) {
        if (checked) next.add(position.id);
        else next.delete(position.id);
      }
      return next;
    });
  }

  function toggleBulkField(field: BulkField, checked: boolean) {
    setEnabledBulkFields((current) => {
      const next = new Set(current);
      if (checked) next.add(field);
      else next.delete(field);
      return next;
    });
  }

  async function saveSingle(position: PortfolioPosition, formData: FormData) {
    if (await onSave(position, formData)) setEditingId(null);
  }

  async function saveBulk() {
    const payload: BulkClassification = { positionIds: [...selectedIds] };
    if (enabledBulkFields.has("assetClass")) {
      payload.assetClass =
        bulkAssetClass === unknownValue ? null : bulkAssetClass;
    }
    if (enabledBulkFields.has("subClass")) {
      payload.subClass = bulkSubClass.trim() || null;
    }
    if (enabledBulkFields.has("geography")) {
      payload.geography = bulkGeography === unknownValue ? null : bulkGeography;
    }
    if (await onSaveBulk(payload)) {
      setEnabledBulkFields(new Set());
      setSelectedIds(new Set());
    }
  }

  return (
    <section
      className="space-y-3 border-t pt-5"
      aria-labelledby="positions-heading"
    >
      <Collapsible open={isOpen || editingId !== null} onOpenChange={setIsOpen}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h3 id="positions-heading" className="text-sm font-semibold">
              Posições e classificação
            </h3>
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {selectedCount} selecionado(s)
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                Limpar seleção
              </Button>
            )}
            {editingId === null && (
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-expanded={isOpen}
                  aria-label={
                    isOpen
                      ? "Recolher posições e classificação"
                      : "Mostrar posições e classificação"
                  }
                >
                  {isOpen ? "Recolher" : "Mostrar posições"}
                  <ChevronDown
                    aria-hidden="true"
                    className={
                      isOpen
                        ? "size-4 rotate-180 transition-transform"
                        : "size-4 transition-transform"
                    }
                  />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>
        <CollapsibleContent className="pt-3">
          {" "}
          <div className="grid gap-3 rounded-lg border p-3 sm:p-4">
            <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="allocation-search">
                  Buscar por produto ou instituição
                </Label>
                <Input
                  id="allocation-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Ex.: CDB, Banco Inter"
                />
              </div>
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <Checkbox
                  aria-label="Selecionar resultados visíveis"
                  checked={visibleSelectionState}
                  onCheckedChange={(checked) =>
                    toggleVisibleSelection(checked === true)
                  }
                  disabled={visiblePositions.length === 0}
                />
                Selecionar resultados ({visiblePositions.length})
              </label>
            </div>
            <fieldset className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3">
              <legend className="sr-only">Campos a aplicar</legend>
              {bulkFields.map(({ key, label }) => (
                <div
                  key={key}
                  className="grid content-start gap-2 rounded-md border bg-background p-3"
                >
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <Checkbox
                      checked={enabledBulkFields.has(key)}
                      onCheckedChange={(checked) =>
                        toggleBulkField(key, checked === true)
                      }
                    />
                    {label}
                  </label>
                  {key === "assetClass" && enabledBulkFields.has(key) && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="bulk-asset-class">Classe em lote</Label>
                      <Select
                        value={bulkAssetClass}
                        onValueChange={setBulkAssetClass}
                      >
                        <SelectTrigger id="bulk-asset-class">
                          <SelectValue placeholder="Selecione uma classe" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={noSelectionValue} disabled>
                            Selecione uma classe
                          </SelectItem>
                          <SelectItem value={unknownValue}>
                            Não informado
                          </SelectItem>
                          {classOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {key === "subClass" && enabledBulkFields.has(key) && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="bulk-sub-class">Subclasse em lote</Label>
                      <Input
                        id="bulk-sub-class"
                        value={bulkSubClass}
                        onChange={(event) =>
                          setBulkSubClass(event.target.value)
                        }
                        maxLength={120}
                        placeholder="Deixe vazio para limpar"
                      />
                    </div>
                  )}
                  {key === "geography" && enabledBulkFields.has(key) && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="bulk-geography">Geografia em lote</Label>
                      <Select
                        value={bulkGeography}
                        onValueChange={setBulkGeography}
                      >
                        <SelectTrigger id="bulk-geography">
                          <SelectValue placeholder="Selecione uma geografia" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={noSelectionValue} disabled>
                            Selecione uma geografia
                          </SelectItem>
                          <SelectItem value={unknownValue}>
                            Não informado
                          </SelectItem>
                          {geographyOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex items-end lg:col-span-3">
                <Button
                  type="button"
                  onClick={() => void saveBulk()}
                  disabled={
                    saving ||
                    selectedCount === 0 ||
                    enabledBulkFields.size === 0 ||
                    (enabledBulkFields.has("assetClass") &&
                      bulkAssetClass === noSelectionValue) ||
                    (enabledBulkFields.has("geography") &&
                      bulkGeography === noSelectionValue)
                  }
                >
                  {saving ? "Aplicando…" : "Aplicar aos selecionados"}
                </Button>
              </div>
            </fieldset>{" "}
            <div
              className="max-h-[55vh] space-y-3 overflow-y-auto overscroll-contain pr-2 sm:max-h-96"
              role="group"
              aria-label="Lista de posições"
            >
              {visiblePositions.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhuma posição corresponde à busca.
                </p>
              ) : (
                visiblePositions.map((position) => (
                  <div key={position.id} className="rounded-lg border p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 items-start gap-3">
                        <Checkbox
                          aria-label={`Selecionar posição ${position.product}`}
                          checked={selectedIds.has(position.id)}
                          onCheckedChange={(checked) =>
                            toggleSelected(position.id, checked === true)
                          }
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {position.product}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {[
                              position.institution,
                              position.classification.assetClass ??
                                unknownLabel,
                              position.classification.subClass ?? unknownLabel,
                              position.classification.geography ?? unknownLabel,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            {position.classificationSource === "inferred"
                              ? " · sugestão baseada no produto ou indexador B3"
                              : position.classificationSource === "manual"
                                ? " · ajuste manual"
                                : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <span className="text-sm tabular-nums">
                          {formatPositionValue(position)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-expanded={editingId === position.id}
                          onClick={() =>
                            setEditingId(
                              editingId === position.id ? null : position.id,
                            )
                          }
                        >
                          {editingId === position.id
                            ? "Fechar"
                            : "Editar classificação"}
                        </Button>
                      </div>
                    </div>
                    {editingId === position.id && (
                      <form
                        className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveSingle(
                            position,
                            new FormData(event.currentTarget),
                          );
                        }}
                      >
                        <div className="grid gap-1.5 text-sm">
                          <Label htmlFor={`asset-class-${position.id}`}>
                            Classe
                          </Label>
                          <Select
                            name="assetClass"
                            defaultValue={
                              position.classification.assetClass ?? unknownValue
                            }
                          >
                            <SelectTrigger id={`asset-class-${position.id}`}>
                              <SelectValue placeholder="Selecione uma classe" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={unknownValue}>
                                Não informado
                              </SelectItem>
                              {classOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1.5 text-sm">
                          <Label htmlFor={`sub-class-${position.id}`}>
                            Subclasse
                          </Label>
                          <Input
                            id={`sub-class-${position.id}`}
                            name="subClass"
                            maxLength={120}
                            defaultValue={
                              position.classification.subClass ?? ""
                            }
                            placeholder="Ex.: Tesouro IPCA+"
                          />
                        </div>
                        <div className="grid gap-1.5 text-sm sm:col-span-2">
                          <Label htmlFor={`geography-${position.id}`}>
                            Geografia
                          </Label>
                          <Select
                            name="geography"
                            defaultValue={
                              position.classification.geography ?? unknownValue
                            }
                          >
                            <SelectTrigger id={`geography-${position.id}`}>
                              <SelectValue placeholder="Selecione uma geografia" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={unknownValue}>
                                Não informado
                              </SelectItem>
                              {geographyOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end sm:col-span-2">
                          <Button type="submit" disabled={saving}>
                            {saving ? "Salvando…" : "Salvar classificação"}
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
