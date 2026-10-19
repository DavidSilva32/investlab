import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { CookieConsentPreferencesButton } from "@/components/cookie-consent-preferences-button";
import { CURRENT_TERMS_VERSION } from "@/lib/privacy-policy";

const documentLinks = [
  { href: "/apresentacao", label: "Conheça o InvestLab" },
  { href: "/termos-de-uso", label: "Termos de Uso" },
  { href: "/privacidade", label: "Privacidade" },
  { href: "/cookies", label: "Cookies" },
  { href: "/mcp", label: "MCP" },
];

export function PublicSiteLayout({
  children,
  authenticated = false,
}: {
  children: React.ReactNode;
  authenticated?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card/70">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            InvestLab
          </Link>
          <nav aria-label="Acesso à conta" className="text-sm">
            <Link
              href={authenticated ? "/dashboard" : "/entrar"}
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {authenticated ? "Voltar ao painel" : "Entrar"}
            </Link>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-border bg-card/50">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-7 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
              Informações e privacidade
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Os Termos de Uso estão na versão vigente do produto (
              {CURRENT_TERMS_VERSION}). As políticas de Privacidade e Cookies
              indicam seus pontos em confirmação.
            </p>
          </div>
          <nav
            aria-label="Documentos do InvestLab"
            className="flex flex-wrap gap-x-5 gap-y-2 text-sm"
          >
            {documentLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
            <CookieConsentPreferencesButton variant="link" />
          </nav>
        </div>
      </footer>
    </div>
  );
}
