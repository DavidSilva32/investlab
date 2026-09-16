export const dynamic = "force-dynamic";
import { importRepository } from "@/backend/repositories/import.repository";
import { AppShell } from "@/components/app-shell";
const quantity = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
export default async function PortfolioPage() {
  const positions = await importRepository.listLatestPositions();
  return (
    <AppShell title="Carteira">
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b p-4 sm:p-6">
          <h2 className="font-semibold">Snapshot atual</h2>
          <p className="text-sm text-slate-500">
            {positions.length
              ? `${positions.length} posições disponíveis`
              : "Nenhuma posição importada"}
          </p>
        </div>
        {positions.length ? (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="min-w-180 w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-4">Produto</th>
                  <th>Código</th>
                  <th>Quantidade</th>
                  <th>Instituição</th>
                  <th className="p-4">Valor atual</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <tr key={position.id} className="border-t hover:bg-slate-50">
                    <td className="p-4 font-medium">{position.product}</td>
                    <td>{position.assetCode ?? "—"}</td>
                    <td>{quantity.format(Number(position.quantity))}</td>
                    <td>{position.institution ?? "—"}</td>
                    <td className="p-4">
                      {position.totalValue
                        ? money.format(Number(position.totalValue))
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-slate-500 sm:p-10">
            Importe um arquivo B3 para visualizar sua carteira.
          </p>
        )}
      </section>
    </AppShell>
  );
}
