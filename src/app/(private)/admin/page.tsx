import { AppShell } from "@/components/app-shell";
import { AdminUsersClient } from "@/app/(private)/admin/users/_components/admin-users-client";

export const dynamic = "force-dynamic";

export default function AdminDashboardPage() {
  return (
    <AppShell title="Administração">
      <AdminUsersClient initialTab="overview" />
    </AppShell>
  );
}
