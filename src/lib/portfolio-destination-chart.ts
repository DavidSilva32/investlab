export const destinationChartConfig = {
  reserve: { label: "Reserva", color: "var(--destination-reserve)" },
  personal: {
    label: "Objetivos pessoais",
    color: "var(--destination-personal)",
  },
  long_term: {
    label: "Investimento de longo prazo",
    color: "var(--destination-long-term)",
  },
  purpose_unknown: {
    label: "Finalidade não definida",
    color: "var(--destination-purpose-unknown)",
  },
  unassigned: { label: "Sem destino", color: "var(--destination-unassigned)" },
} as const;

export type PortfolioDestinationKey = keyof typeof destinationChartConfig;
