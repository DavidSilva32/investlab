import Link from "next/link";
import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  PRIVACY_DOCUMENT_DATE,
  PRIVACY_DOCUMENT_REVIEW_STATUS,
} from "@/lib/privacy-policy";

export type LegalDocumentSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export function LegalDocumentPage({
  title,
  introduction,
  sections,
}: {
  title: string;
  introduction: string;
  sections: LegalDocumentSection[];
}) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="border-b border-border pb-7">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <FileText aria-hidden="true" className="size-4" />
          Documento do InvestLab
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          {introduction}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Situação
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              Rascunho em revisão
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Atualizado em
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {PRIVACY_DOCUMENT_DATE}
            </p>
          </div>
        </div>
      </header>

      <Card className="mt-6 border-status-warning/40 bg-status-warning/5">
        <CardContent className="p-4 sm:p-5">
          <p className="font-medium text-foreground">
            Documento em revisão — ainda não é uma versão definitiva
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {PRIVACY_DOCUMENT_REVIEW_STATUS} Os pontos pendentes estão
            identificados no texto e dependem de confirmação antes da aprovação
            final.
          </p>
        </CardContent>
      </Card>

      <div className="mt-8 space-y-8">
        {sections.map((section, index) => (
          <section
            key={section.title}
            aria-labelledby={`document-section-${index}`}
            className="scroll-mt-8"
          >
            <h2
              id={`document-section-${index}`}
              className="text-xl font-semibold tracking-tight text-foreground"
            >
              {section.title}
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul className="list-disc space-y-2 pl-6">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>

      <nav
        aria-label="Outros documentos"
        className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 text-sm"
      >
        <Link
          href="/termos-de-uso"
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Termos de Uso
        </Link>
        <Link
          href="/privacidade"
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Política de Privacidade
        </Link>
        <Link
          href="/cookies"
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Política de Cookies
        </Link>
      </nav>
    </main>
  );
}
