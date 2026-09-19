"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Position = {
  product: string;
  quantity: string;
  totalValue: string | null;
};
type Movement = {
  occurredAt: string;
  movementType: string;
  product: string;
  quantity: string;
  operationValue: string | null;
};
type Preview =
  | { documentType: "B3_POSITION_XLSX"; positions: Position[]; count: number }
  | { documentType: "B3_MOVEMENT_XLSX"; movements: Movement[]; count: number };
type Item = { file: File; preview?: Preview; error?: string };
type MutationResponse = { message?: string };
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function PortfolioImport() {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  async function send(file: File, endpoint: string) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(endpoint, { method: "POST", body: form });
    const body = (await response.json()) as MutationResponse & Preview;
    if (!response.ok)
      throw new Error(body.message ?? "Não foi possível ler o arquivo.");
    return body;
  }

  async function previewFiles(files: File[]) {
    setLoading(true);
    setItems(files.map((file) => ({ file })));
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const body = await send(file, "/api/imports/preview");
          return {
            file,
            preview: body.documentType
              ? (body as Preview)
              : {
                  documentType: "B3_POSITION_XLSX" as const,
                  positions:
                    (body as { positions?: Position[] }).positions ?? [],
                  count: (body as Partial<Preview>).count ?? 0,
                },
          };
        } catch (error) {
          return {
            file,
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível comunicar com o servidor.",
          };
        }
      }),
    );
    setItems(results);
    setLoading(false);
  }

  async function confirm() {
    const ready = items.filter((item): item is Item & { preview: Preview } =>
      Boolean(item.preview),
    );
    setLoading(true);
    const results = await Promise.all(
      ready.map(async (item) => {
        try {
          const response = await send(item.file, "/api/imports/confirm");
          return { item, message: response.message };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível salvar o arquivo.";
          toast.error(message);
          return {
            item: { ...item, error: message },
          };
        }
      }),
    );
    setLoading(false);
    const confirmedItems = results.map((result) => result.item);
    if (confirmedItems.every((item) => !item.error)) {
      results.forEach((result) =>
        toast.success(result.message ?? "Arquivo importado com sucesso."),
      );
      location.reload();
    } else setItems(confirmedItems);
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Importar dados B3</h2>
          <p className="text-sm text-muted-foreground">
            Envie posições e movimentações juntas. O preview é gerado
            automaticamente antes de salvar.
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          disabled={loading}
          onClick={() => input.current!.click()}
        >
          Importar carteira
        </Button>
      </div>
      <input
        ref={input}
        className="hidden"
        type="file"
        multiple
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) void previewFiles(files);
          event.target.value = "";
        }}
      />
      {loading && (
        <p className="mt-4 text-sm text-muted-foreground">Lendo arquivos...</p>
      )}
      <div className="mt-5 space-y-5">
        {items.map((item) => (
          <PreviewItem
            key={`${item.file.name}-${item.file.lastModified}`}
            item={item}
          />
        ))}
      </div>
      {items.some((item) => item.preview) && (
        <div className="mt-5 flex gap-3">
          <Button disabled={loading} onClick={confirm}>
            {loading
              ? "Salvando..."
              : `Confirmar ${items.filter((item) => item.preview).length} arquivo(s)`}
          </Button>
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => setItems([])}
          >
            Cancelar
          </Button>
        </div>
      )}
    </section>
  );
}

function PreviewItem({ item }: { item: Item }) {
  if (item.error)
    return (
      <p aria-live="polite" className="text-sm text-destructive">
        {item.file.name}: {item.error}
      </p>
    );
  if (!item.preview) return <p className="text-sm">{item.file.name}</p>;
  const records =
    item.preview.documentType === "B3_POSITION_XLSX"
      ? item.preview.positions
      : item.preview.movements;
  return (
    <div>
      <h3 className="font-medium">
        {item.file.name} — {item.preview.count}{" "}
        {item.preview.documentType === "B3_POSITION_XLSX"
          ? "posições"
          : "movimentações"}{" "}
        encontradas
      </h3>
      <div className="mt-3 max-h-64 overflow-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <tbody>
            {records.map((record, index) =>
              item.preview?.documentType === "B3_POSITION_XLSX" ? (
                <tr key={index} className="border-t">
                  <td className="p-2">{record.product}</td>
                  <td>
                    {number.format(Number((record as Position).quantity))}
                  </td>
                  <td>
                    {(record as Position).totalValue
                      ? money.format(Number((record as Position).totalValue))
                      : "—"}
                  </td>
                </tr>
              ) : (
                <tr key={index} className="border-t">
                  <td className="p-2">
                    {date.format(
                      new Date(`${(record as Movement).occurredAt}T00:00:00Z`),
                    )}
                  </td>
                  <td>{(record as Movement).movementType}</td>
                  <td>{record.product}</td>
                  <td>
                    {number.format(Number((record as Movement).quantity))}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {(record as Movement).operationValue
                      ? money.format(
                          Number((record as Movement).operationValue),
                        )
                      : "—"}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
