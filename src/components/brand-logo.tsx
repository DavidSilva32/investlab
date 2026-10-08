import { useId } from "react";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  symbolOnly?: boolean;
};

export function BrandLogo({ className, symbolOnly = false }: BrandLogoProps) {
  const gradientId = useId();

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        aria-hidden="true"
        className="size-9 shrink-0"
        data-testid="investlab-symbol"
        fill="none"
        viewBox="0 0 64 64"
      >
        <defs>
          <linearGradient
            id={`${gradientId}-bars`}
            x1="14"
            x2="45"
            y1="48"
            y2="14"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#0875f5" />
            <stop offset="1" stopColor="#27c5f5" />
          </linearGradient>
          <linearGradient
            id={`${gradientId}-sweep`}
            x1="8"
            x2="56"
            y1="54"
            y2="36"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#0875f5" />
            <stop offset="1" stopColor="currentColor" />
          </linearGradient>
        </defs>
        <path
          d="M14 33.5a2.5 2.5 0 0 1 1.25-2.17l5.5-3.17A2.5 2.5 0 0 1 24.5 30.3V49h-10.5V33.5Z"
          fill={`url(#${gradientId}-bars)`}
        />
        <path
          d="M27 26.5a2.5 2.5 0 0 1 1.25-2.17l5.5-3.17A2.5 2.5 0 0 1 37.5 23.3V49H27V26.5Z"
          fill={`url(#${gradientId}-bars)`}
        />
        <path
          d="M40 17.5a2.5 2.5 0 0 1 1.25-2.17l5.5-3.17A2.5 2.5 0 0 1 50.5 14.3V49H40V17.5Z"
          fill={`url(#${gradientId}-bars)`}
        />
        <path
          d="M7.5 49.5c3.2 8.1 16.8 8.1 29.1 1.1C46.1 45.3 53.2 34.9 57 20"
          stroke={`url(#${gradientId}-sweep)`}
          strokeLinecap="round"
          strokeWidth="4.5"
        />
        <path
          d="m48.5 21.7 9.8-12.2 2.9 15.4-5.4-3.2-5.8 3.3-1.5-3.3Z"
          fill="currentColor"
        />
      </svg>
      {!symbolOnly && (
        <span className="whitespace-nowrap text-lg font-bold tracking-tight text-foreground">
          Invest<span className="text-brand">Lab</span>
        </span>
      )}
    </span>
  );
}
