"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
type Position = {
  product: string;
  assetCode: string | null;
  quantity: string;
  institution: string | null;
  maturityAt: string | null;
  totalValue: string | null;
};
type Movement = {
  direction: string;
  occurredAt: string;
  movementType: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  quantity: string;
  unitPrice: string | null;
  operationValue: string | null;
};
type Preview =
  | { documentType: "B3_POSITION_XLSX"; positions: Position[]; count: number }
  | { documentType: "B3_MOVEMENT_XLSX"; movements: Movement[]; count: number };
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
export function PortfolioImport() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const send = async (endpoint: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const form = new FormData();
      form.append("file", file!);
      const response = await fetch(endpoint, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        setError(body.message);
        return;
      }
      return body;
    } catch {
      setError("Não foi possível comunicar com o servidor.");
    } finally {
      setLoading(false);
    }
  };
  const previewFile = async () => {
    const body = await send("/api/imports/preview");
    if (body)
      setPreview(
        body.documentType
          ? body
          : { documentType: "B3_POSITION_XLSX", ...body },
      );
  };
  const confirm = async () => {
    if (await send("/api/imports/confirm")) location.reload();
  };
  const records =
    preview?.documentType === "B3_POSITION_XLSX"
      ? preview.positions
      : preview?.movements;
  const label =
    preview?.documentType === "B3_POSITION_XLSX"
      ? "Posição B3"
      : "Movimentação B3";
  return (
    <section className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Importar dados B3</h2>
          <p className="text-sm text-muted-foreground">
            Envie um XLSX de posições ou movimentações para revisar antes de
            salvar.
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          disabled={loading}
          onClick={() => input.current?.click()}
        >
          Importar carteira
        </Button>
      </div>
      <input
        ref={input}
        className="hidden"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          setFile(event.target.files?.[0]);
          setPreview(undefined);
        }}
      />
      {file && !preview && (
        <div className="mt-4 flex gap-3">
          <span className="break-all text-sm">{file.name}</span>
          <Button
            variant="link"
            className="h-auto p-0"
            disabled={loading}
            onClick={previewFile}
          >
            {loading ? "Lendo..." : "Gerar preview"}
          </Button>
        </div>
      )}
      {error && (
        <p aria-live="polite" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {preview && (
        <div className="mt-5">
          <h3 className="font-medium">
            {label} — {preview.count}{" "}
            {preview.documentType === "B3_POSITION_XLSX"
              ? "posições encontradas"
              : "movimentações encontradas"}
          </h3>
          <div className="mt-3 max-h-64 overflow-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {preview.documentType === "B3_POSITION_XLSX" ? (
                    <>
                      <th className="p-2">Produto</th>
                      <th>Código</th>
                      <th>Quantidade</th>
                      <th>Instituição</th>
                      <th>Valor atual</th>
                    </>
                  ) : (
                    <>
                      <th className="p-2">Data</th>
                      <th>Tipo</th>
                      <th>Produto</th>
                      <th>Quantidade</th>
                      <th>Valor</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {records?.map((record, index) =>
                  preview.documentType === "B3_POSITION_XLSX" ? (
                    <tr key={index} className="border-t">
                      <td className="p-2">{record.product}</td>
                      <td>{record.assetCode ?? "—"}</td>
                      <td>{number.format(Number(record.quantity))}</td>
                      <td>{record.institution ?? "—"}</td>
                      <td>
                        {(record as Position).totalValue
                          ? money.format(
                              Number((record as Position).totalValue),
                            )
                          : "—"}
                      </td>
                    </tr>
                  ) : (
                    <tr key={index} className="border-t">
                      <td className="p-2">
                        {date.format(
                          new Date(
                            `${(record as Movement).occurredAt}T00:00:00Z`,
                          ),
                        )}
                      </td>
                      <td>{(record as Movement).movementType}</td>
                      <td>{record.product}</td>
                      <td>{number.format(Number(record.quantity))}</td>
                      <td>
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
          <div className="mt-4 flex gap-3">
            <Button disabled={loading} onClick={confirm}>
              {loading ? "Salvando..." : "Confirmar importação"}
            </Button>
            <Button
              variant="ghost"
              disabled={loading}
              onClick={() => setPreview(undefined)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
