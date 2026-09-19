import { Buffer } from "node:buffer";
import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { CvmFundamentalsProvider } from "@/backend/providers/cvm-fundamentals.provider";

const header =
  "CNPJ_CIA;CD_CVM;DT_REFER;VERSAO;ORDEM_EXERC;CD_CONTA;VL_CONTA;ESCALA_MOEDA";
const cad =
  "CNPJ_CIA;CD_CVM;DENOM_SOCIAL;SIT\n33.000.167/0001-01;9512;PETROLEO BRASILEIRO S.A.;ATIVO\n";
const dfp = [
  header,
  "33.000.167/0001-01;9512;2025-12-31;1;ÚLTIMO;3.01;100;MIL",
  "33.000.167/0001-01;9512;2025-12-31;2;ÚLTIMO;3.01;101;MIL",
  "33.000.167/0001-01;9512;2025-12-31;2;ÚLTIMO;3.11;20;MIL",
  "33.000.167/0001-01;9512;2025-12-31;2;ÚLTIMO;2.03;30;MIL",
  "33.000.167/0001-01;9512;2025-12-31;2;ÚLTIMO;1;40;MIL",
  "33.000.167/0001-01;9512;2025-12-31;2;ÚLTIMO;2;10;MIL",
  "33.000.167/0001-01;9512;2025-12-31;2;PENÚLTIMO;3.01;999;MIL",
].join("\n");

function csvZip(name: string, csv: string) {
  return zipSync({ [name]: Buffer.from(csv, "latin1") });
}

describe("CvmFundamentalsProvider", () => {
  it("maps the BRAPI CNPJ to the CVM issuer and normalizes streamed DFP rows", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(cad))
      .mockResolvedValueOnce(
        new Response(csvZip("dfp_cia_aberta_DRE_con_2025.csv", dfp)),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const provider = new CvmFundamentalsProvider(fetcher);

    const periods = await provider.getByTicker({
      ticker: "PETR4",
      cnpj: "33.000.167/0001-01",
    });

    expect(periods).toContainEqual(
      expect.objectContaining({
        referenceDate: "2025-12-31",
        sourceDocument: "DFP",
        periodType: "annual",
        revenue: "101000.00",
        netIncome: "20000.00",
        equity: "30000.00",
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
});
