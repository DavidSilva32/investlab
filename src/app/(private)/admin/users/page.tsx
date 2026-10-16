import { AppShell } from "@/components/app-shell";
import { AdminUsersClient } from "@/app/(private)/admin/users/_components/admin-users-client";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return (
    <AppShell title="Usuários e acessos">
      <AdminUsersClient />
    </AppShell>
  );
}
