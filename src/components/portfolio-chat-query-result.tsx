import { formatCurrencyCents } from "@/lib/portfolio-money";
import Image from "next/image";

export type PortfolioChatListedPosition = {
  id: string;
  product: string;
  assetCode: string | null;
  issuer: string | null;
  institution: string | null;
  valueCents: string | null;
};

export function PortfolioChatThinkingIndicator({
  message = "Conferindo sua carteira",
}: {
  message?: string;
} = {}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="motion-content-reveal flex items-end gap-2 py-1 text-sm text-muted-foreground"
    >
      <Image
        src="/images/investlab-assistant-mascot.png"
        alt=""
        aria-hidden="true"
        width={24}
        height={24}
        className="size-6 shrink-0 rounded-full border border-border object-cover"
      />
      <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-muted px-3 py-2">
        <span>{message}</span>
        <span aria-hidden="true" className="flex items-center gap-1">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-1.5 rounded-full bg-primary motion-safe:animate-bounce motion-reduce:animate-none"
              style={{ animationDelay: `${dot * 120}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

export function PortfolioChatAssetList({
  items,
}: {
  items: PortfolioChatListedPosition[];
}) {
  return (
    <ul className="ml-9 grid gap-2" aria-label="Ativos encontrados na carteira">
      {items.map((item) => (
        <li
          key={item.id}
          className="motion-content-reveal rounded-lg border border-border/70 bg-card px-3 py-2"
        >
          <p className="font-medium">
            {item.assetCode || item.product}
            {item.assetCode && item.product !== item.assetCode && (
              <span className="ml-1 text-muted-foreground">
                · {item.product}
              </span>
            )}
          </p>
          {(item.issuer || item.institution) && (
            <p className="text-sm text-muted-foreground">
              {item.issuer || item.institution}
            </p>
          )}
          {item.valueCents !== null && /^-?\d{1,40}$/.test(item.valueCents) && (
            <p className="mt-1 text-sm">
              {formatCurrencyCents(BigInt(item.valueCents))}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
