"use client";

import { useRef, useState } from "react";

type Position = {
  product: string;
  assetCode: string | null;
  quantity: string;
  institution: string | null;
  maturityAt: string | null;
  totalValue: string | null;
};

const quantityFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 8,
});
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(`${value}T00:00:00.000Z`)) : "—";
}

function formatMoney(value: string | null) {
  return value ? currencyFormatter.format(Number(value)) : "—";
}

export function PortfolioImport() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [positions, setPositions] = useState<Position[]>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const send = async (endpoint: string) => {
    /* v8 ignore next -- the action is unavailable until a file is selected. */
    if (!file) return;
    setLoading(true);
    setError(undefined);
    try {
      const form = new FormData();
      form.append("file", file);
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

  const preview = async () => {
    const body = await send("/api/imports/preview");
    if (body) setPositions(body.positions);
  };
  const confirm = async () => {
    const body = await send("/api/imports/confirm");
    if (body) location.reload();
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Importar carteira</h2>
          <p className="text-sm text-muted-foreground">
            Envie sua posição B3 em XLSX para revisar antes de salvar.
          </p>
        </div>
        <button
          className="w-full cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          disabled={loading}
          onClick={() => input.current?.click()}
        >
          Importar carteira
        </button>
      </div>
      <input
        ref={input}
        className="hidden"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          setFile(event.target.files?.[0]);
          setPositions(undefined);
        }}
      />
      {file && !positions && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <span className="break-all text-sm">{file.name}</span>
          <button
            className="cursor-pointer text-sm font-medium underline transition text-primary hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onClick={preview}
          >
            {loading ? "Lendo..." : "Gerar preview"}
          </button>
        </div>
      )}
      {error && (
        <p aria-live="polite" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {positions && (
        <div className="mt-5">
          <h3 className="font-medium">Preview: {positions.length} posições</h3>
          <div className="mt-2 max-h-64 overflow-auto rounded border">
            <table className="min-w-180 w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2">Produto</th>
                  <th>Código</th>
                  <th>Quantidade</th>
                  <th>Instituição</th>
                  <th>Vencimento</th>
                  <th>Valor atual</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position, index) => (
                  <tr key={`${position.product}-${index}`} className="border-t">
                    <td className="p-2">{position.product}</td>
                    <td>{position.assetCode ?? "—"}</td>
                    <td>
                      {quantityFormatter.format(Number(position.quantity))}
                    </td>
                    <td>{position.institution ?? "—"}</td>
                    <td>{formatDate(position.maturityAt)}</td>
                    <td>{formatMoney(position.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              className="w-full cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={loading}
              onClick={confirm}
            >
              {loading ? "Salvando..." : "Confirmar importação"}
            </button>
            <button
              className="w-full cursor-pointer rounded-md px-4 py-2 text-sm underline transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              onClick={() => setPositions(undefined)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
