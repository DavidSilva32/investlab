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
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Aparência</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
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
        <DropdownMenuLabel>Cor da identidade</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={selected.value}
          onValueChange={setPalette}
          aria-label="Cor da identidade"
        >
          {themePalettes.map(({ value, label }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <span
                aria-hidden="true"
                className="palette-swatch size-4 shrink-0 rounded-full border border-border"
                data-palette={value}
              />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
