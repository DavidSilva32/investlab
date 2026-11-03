import {
  BriefcaseBusiness,
  CarFront,
  CircleEllipsis,
  FolderOpen,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  PartyPopper,
  ReceiptText,
  ShieldCheck,
  Utensils,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

const categoryIcons: Record<string, LucideIcon> = {
  salario: WalletCards,
  "trabalho autonomo": BriefcaseBusiness,
  beneficios: Gift,
  "renda de aluguel": House,
  "outras entradas": CircleEllipsis,
  moradia: House,
  alimentacao: Utensils,
  transporte: CarFront,
  saude: HeartPulse,
  educacao: GraduationCap,
  "contas e servicos": ReceiptText,
  lazer: PartyPopper,
  "impostos e taxas": Landmark,
  seguros: ShieldCheck,
  "outras despesas": CircleEllipsis,
};

export function getFinancialCategoryIcon(name: string): LucideIcon {
  const normalized = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  return categoryIcons[normalized] ?? FolderOpen;
}
