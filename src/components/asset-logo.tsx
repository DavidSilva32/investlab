"use client";

import Image from "next/image";
import { useState } from "react";
import { resolveAssetLogoUrl } from "@/lib/asset-logo";
import { cn } from "@/lib/utils";

const sizes = { sm: 24, md: 32, lg: 40, xl: 64 };
const textSizes = {
  sm: "text-[9px]",
  md: "text-[10px]",
  lg: "text-xs",
  xl: "text-lg",
};

type AssetLogoProps = {
  ticker?: string | null;
  name?: string | null;
  logoUrl?: string | null;
  size?: keyof typeof sizes;
  className?: string;
};

export function AssetLogo({
  ticker,
  name,
  logoUrl,
  size = "md",
  className,
}: AssetLogoProps) {
  const source = resolveAssetLogoUrl(ticker, logoUrl);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const label = name || ticker || "Ativo";
  const dimension = sizes[size];
  return (
    <span
      role="img"
      aria-label={`Identidade de ${label}`}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted font-semibold text-muted-foreground",
        textSizes[size],
        className,
      )}
      style={{ width: dimension, height: dimension }}
    >
      <span aria-hidden="true">
        {ticker?.trim().toUpperCase().slice(0, 2) || "—"}
      </span>
      {source && failedSource !== source && (
        <Image
          src={source}
          alt=""
          aria-hidden="true"
          width={dimension}
          height={dimension}
          unoptimized
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn(
            "absolute inset-0 h-full w-full bg-white object-contain p-0.5",
            loadedSource !== source && "opacity-0",
          )}
          onLoad={() => setLoadedSource(source)}
          onError={() => setFailedSource(source)}
        />
      )}
    </span>
  );
}
