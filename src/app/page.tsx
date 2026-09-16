export const dynamic = "force-dynamic";

import { PortfolioImport } from "@/components/portfolio-import";
import { importRepository } from "@/backend/repositories/import.repository";
export default async function HomePage() {
  const positions = await importRepository.listLatestPositions();
  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-slate-50 p-6 text-slate-900">
      <header className="mb-8">
        <p className="text-sm font-medium text-emerald-700">InvestLab</p>
        <h1 className="text-3xl font-bold">Sua carteira</h1>
        <p className="mt-2 text-slate-600">
          PosiÃ§Ãµes informadas pela Ãºltima importaÃ§Ã£o confirmada.
        </p>
      </header>
      <PortfolioImport />
      {positions.length ? (
        <section className="mt-8 rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold">PosiÃ§Ãµes importadas</h2>
          <ul className="mt-4 divide-y">
            {positions.map((item) => (
              <li key={item.id} className="flex justify-between py-3">
                <span>
                  {item.product}
                  {item.assetCode ? ` (${item.assetCode})` : ""}
                </span>
                <span>{item.quantity}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mt-8 rounded-xl border border-dashed bg-white p-8 text-center">
          <h2 className="font-semibold">Nenhuma posiÃ§Ã£o importada</h2>
          <p className="mt-2 text-sm text-slate-600">
            Importe seu arquivo de posiÃ§Ãµes da B3 para comeÃ§ar.
          </p>
        </section>
      )}
    </main>
  );
}
