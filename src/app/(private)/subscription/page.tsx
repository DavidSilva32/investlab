import { AppShell } from "@/components/app-shell";
import { BillingManagement } from "./_components/billing-management";

export default function SubscriptionPage() {
  return (
    <AppShell title="Assinatura">
      <BillingManagement />
    </AppShell>
  );
}
