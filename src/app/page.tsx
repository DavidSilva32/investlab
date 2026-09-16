export const dynamic = "force-dynamic";

import { importRepository } from "@/backend/repositories/import.repository";
import { AppShell } from "@/components/app-shell";
import { PortfolioImport } from "@/components/portfolio-import";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function HomePage() {
  const positions = await importRepository.listLatestPositions();
  const knownTotal = positions.reduce(
    (total, position) => total + Number(position.totalValue ?? 0),
    0,
  );
  const hasTotal = positions.some((position) => position.totalValue !== null);
  return (
    <AppShell title="Dashboard">
      <section className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {[
          [
            "Patrimônio total",
            hasTotal ? currency.format(knownTotal) : "Indisponível",
          ],
          ["Valor investido", "Indisponível"],
          ["Resultado", "Indisponível"],
          ["Rentabilidade", "Indisponível"],
        ].map(([label, value]) => (
          <article
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold">{value}</p>
            {value === "Indisponível" && (
              <p className="mt-1 text-xs text-slate-400">
                Sem dados suficientes
              </p>
            )}
          </article>
        ))}
      </section>
      <section className="mt-6 grid gap-6 lg:grid-cols-5">
        <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 lg:col-span-3">
          <h2 className="font-semibold">Distribuição da carteira</h2>
          <p className="mt-8 rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
            A distribuição estará disponível quando houver dados suficientes.
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 lg:col-span-2">
          <h2 className="font-semibold">Posições recentes</h2>
          {positions.length ? (
            <ul className="mt-3 divide-y">
              {positions.slice(0, 5).map((position) => (
                <li
                  key={position.id}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <span className="min-w-0 truncate">{position.product}</span>
                  <span className="shrink-0">{position.quantity}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 text-sm text-slate-500">
              Nenhuma posição importada.
            </p>
          )}
        </article>
      </section>
      <section
        id="importacoes"
        className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6"
      >
        <div className="mb-4">
          <h2 className="font-semibold">Importações</h2>
          <p className="text-sm text-slate-500">
            Atualize o snapshot da carteira com o arquivo B3.
          </p>
        </div>
        <PortfolioImport />
      </section>
    </AppShell>
  );
}
