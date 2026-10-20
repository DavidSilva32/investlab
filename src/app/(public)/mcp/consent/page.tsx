import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { McpConsentForm } from "@/app/(public)/mcp/consent/mcp-consent-form";
import { getAuthSecret } from "@/infrastructure/auth/auth-configuration";

type ConsentPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function McpConsentPage({
  searchParams,
}: ConsentPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  const oauthQuery = query.toString();
  if (
    !oauthQuery ||
    !(await verifyOAuthQueryParams(oauthQuery, getAuthSecret()))
  ) {
    notFound();
  }

  const { auth } = await import("@/infrastructure/auth/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(
      `/entrar?callbackURL=${encodeURIComponent(`/mcp/consent?${oauthQuery}`)}`,
    );
  }

  const scopes = (query.get("scope") ?? "").split(/\s+/).filter(Boolean);
  const clientName = query.get("client_name") ?? "Aplicativo externo";

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl items-center px-4 py-10">
      <section className="w-full rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium text-primary">Conexão segura</p>
        <h1 className="mt-2 text-2xl font-semibold">
          Autorizar acesso ao InvestLab
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {clientName} está solicitando acesso à sua conta InvestLab. Revise as
          permissões antes de continuar.
        </p>
        <ul className="mt-5 list-disc space-y-2 pl-5 text-sm">
          {scopes.map((scope) => (
            <li key={scope}>{scopeLabel(scope)}</li>
          ))}
        </ul>
        <McpConsentForm oauthQuery={oauthQuery} />
      </section>
    </main>
  );
}

export function scopeLabel(scope: string) {
  if (scope === "mcp:read") return "Consultar sua carteira e posições.";
  if (scope === "mcp:admin:read")
    return "Buscar dados básicos de contas e consultar a carteira escolhida; disponível somente para ADMIN.";
  if (scope === "openid") return "Confirmar sua identidade para esta conexão.";
  if (scope === "profile")
    return "Compartilhar informações básicas do seu perfil.";
  if (scope === "email") return "Compartilhar seu endereço de e-mail.";
  if (scope === "offline_access")
    return "Manter a conexão ativa até você revogá-la.";
  return scope;
}
