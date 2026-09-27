import { describe, expect, it } from "vitest";
import {
  classifyCvmSector,
  cvmSectorClassificationMessage,
} from "@/lib/cvm-sector-classification";

describe("classifyCvmSector", () => {
  it.each([
    "Bancos",
    "Intermediação Financeira",
    "Securitização de Recebíveis",
    "Seguradoras e Corretoras",
    "Bolsas de Valores/Mercadorias e Futuros",
    "Arrendamento Mercantil",
  ])("classifies explicit financial sector %s", (sector) => {
    expect(classifyCvmSector(sector)).toBe("financial");
  });

  it.each([
    "Agricultura (Açúcar, Álcool e Cana)",
    "Alimentos",
    "Bebidas e Fumo",
    "Brinquedos e Lazer",
    "Comércio (Atacado e Varejo)",
    "Comunicação e Informática",
    "Construção Civil, Mat. Constr. e Decoração",
    "Educação",
    "Embalagens",
    "Energia Elétrica",
    "Extração Mineral",
    "Farmacêutico e Higiene",
    "Hospedagem e Turismo",
    "Máquinas, Equipamentos, Veículos e Peças",
    "Metalurgia e Siderurgia",
    "Papel e Celulose",
    "Petróleo e Gás",
    "Petroquímicos e Borracha",
    "Reflorestamento",
    "Saneamento, Serv. Água e Gás",
    "Serviços Médicos",
    "Serviços Transporte e Logística",
    "Telecomunicações",
    "Têxtil e Vestuário",
  ])("classifies validated nonfinancial sector %s", (sector) => {
    expect(classifyCvmSector(sector)).toBe("non_financial");
  });

  it.each([
    "Emp. Adm. Part. - Agricultura (Açúcar, Álcool e Cana)",
    "Emp. Adm. Part. - Alimentos",
    "Emp. Adm. Part. - Bancos",
    "Emp. Adm. Part. - Brinquedos e Lazer",
    "Emp. Adm. Part. - Comércio (Atacado e Varejo)",
    "Emp. Adm. Part. - Comunicação e Informática",
    "Emp. Adm. Part. - Const. Civil, Mat. Constr. e Decoração",
    "Emp. Adm. Part. - Crédito Imobiliário",
    "Emp. Adm. Part. - Educação",
    "Emp. Adm. Part. - Energia Elétrica",
    "Emp. Adm. Part. - Extração Mineral",
    "Emp. Adm. Part. - Hospedagem e Turismo",
    "Emp. Adm. Part. - Intermediação Financeira",
    "Emp. Adm. Part. - Máqs., Equip., Veíc. e Peças",
    "Emp. Adm. Part. - Metalurgia e Siderurgia",
    "Emp. Adm. Part. - Papel e Celulose",
    "Emp. Adm. Part. - Petróleo e Gás",
    "Emp. Adm. Part. - Saneamento, Serv. Água e Gás",
    "Emp. Adm. Part. - Seguradoras e Corretoras",
    "Emp. Adm. Part. - Sem Setor Principal",
    "Emp. Adm. Part. - Serviços médicos",
    "Emp. Adm. Part. - Serviços Transporte e Logística",
    "Emp. Adm. Part. - Telecomunicações",
  ])("keeps holding sector %s ambiguous", (sector) => {
    expect(classifyCvmSector(sector)).toBe("ambiguous");
  });

  it.each([null, "", " ", "Setor CVM novo", "Emp. Adm. Part. - Setor novo"])(
    "keeps missing or unmapped sector %s unknown",
    (sector) => {
      expect(classifyCvmSector(sector)).toBe("unknown");
    },
  );

  it("normalizes only whitespace, case and accents before exact comparison", () => {
    expect(classifyCvmSector("  BANCOS  ")).toBe("financial");
    expect(classifyCvmSector("comunicacao e informatica")).toBe(
      "non_financial",
    );
    expect(classifyCvmSector("Bancos e Serviços Financeiros")).toBe("unknown");
  });
});

describe("cvmSectorClassificationMessage", () => {
  it.each([
    ["financial", "Fora do escopo"],
    ["non_financial", "não financeiro"],
    ["ambiguous", "holding"],
    ["unknown", "não mapeado"],
  ] as const)("explains %s", (classification, expected) => {
    expect(cvmSectorClassificationMessage(classification)).toContain(expected);
  });
});
