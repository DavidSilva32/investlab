export type CvmSectorClassification =
  "financial" | "non_financial" | "ambiguous" | "unknown";

function normalizeCvmSector(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR");
}

const financialSectors = new Set([
  "Bancos",
  "Intermediação Financeira",
  "Securitização de Recebíveis",
  "Seguradoras e Corretoras",
  "Bolsas de Valores/Mercadorias e Futuros",
  "Arrendamento Mercantil",
]);

const nonFinancialSectors = new Set([
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
]);

const holdingSectors = new Set([
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
]);

function normalizedSet(values: Set<string>) {
  return new Set([...values].map(normalizeCvmSector));
}

const normalizedFinancialSectors = normalizedSet(financialSectors);
const normalizedNonFinancialSectors = normalizedSet(nonFinancialSectors);
const normalizedHoldingSectors = normalizedSet(holdingSectors);

export function classifyCvmSector(
  sector: string | null | undefined,
): CvmSectorClassification {
  const normalized = normalizeCvmSector(sector);
  if (!normalized) return "unknown";
  if (normalizedFinancialSectors.has(normalized)) return "financial";
  if (normalizedNonFinancialSectors.has(normalized)) return "non_financial";
  if (normalizedHoldingSectors.has(normalized)) return "ambiguous";
  return "unknown";
}

export function cvmSectorClassificationMessage(
  classification: CvmSectorClassification,
) {
  switch (classification) {
    case "financial":
      return "Fora do escopo da metodologia para empresas não financeiras.";
    case "non_financial":
      return "Setor classificado como não financeiro para a metodologia atual.";
    case "ambiguous":
      return "Setor CVM de holding; a classificação não permite avaliar a atividade da companhia.";
    case "unknown":
      return "Setor ausente ou não mapeado; a metodologia não foi aplicada.";
  }
}
