import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RecurringExpensesPage(): never {
  redirect("/financas?gerenciar=recorrencias");
}
