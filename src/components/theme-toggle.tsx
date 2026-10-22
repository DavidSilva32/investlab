"use client";

import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemePalette } from "@/components/theme-provider";
import { themePalettes } from "@/lib/theme-palettes";

const appearanceOptions = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
  { value: "system", label: "Automático", Icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { palette, setPalette } = useThemePalette();
  const selected =
    themePalettes.find((item) => item.value === palette) ?? themePalettes[0];
  const selectedAppearance =
    appearanceOptions.find((item) => item.value === theme) ??
    appearanceOptions[2];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Aparência e cores">
          <Palette aria-hidden="true" className="size-4" />
          <span className="sr-only">
            Aparência: {selectedAppearance.label}; cor: {selected.label}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] p-2"
      >
        <DropdownMenuLabel className="px-2 text-xs uppercase tracking-wide text-muted-foreground">
          Aparência
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          className="space-y-1"
          value={theme ?? "system"}
          onValueChange={setTheme}
          aria-label="Aparência"
        >
          {appearanceOptions.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2 text-xs uppercase tracking-wide text-muted-foreground">
          Cor da identidade
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={selected.value}
          onValueChange={setPalette}
          aria-label="Cor da identidade"
        >
          {themePalettes.map(({ value, label }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <span className="min-w-0 flex-1 font-medium">{label}</span>
              <span
                aria-hidden="true"
                className="palette-swatch h-3.5 w-24 shrink-0 overflow-hidden rounded-full border border-border/70 shadow-inner"
                data-palette={value}
              />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
