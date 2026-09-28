"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getPortfolioAssetSubClassSuggestions } from "@/lib/portfolio-asset-subclass-options";
import { cn } from "@/lib/utils";

type AssetSubclassInputProps = {
  id: string;
  name?: string;
  assetClass: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function AssetSubclassInput({
  id,
  name,
  assetClass,
  value,
  onChange,
  placeholder = "Selecione ou digite",
}: AssetSubclassInputProps) {
  const suggestions = getPortfolioAssetSubClassSuggestions(assetClass);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  const hasExactSuggestion = suggestions.some(
    (suggestion) =>
      suggestion.toLocaleLowerCase("pt-BR") ===
      query.trim().toLocaleLowerCase("pt-BR"),
  );
  const customValue = query.trim();
  const updateValue = (nextValue: string) => {
    onChange(nextValue);
    setQuery(nextValue);
  };
  const chooseCustomValue = () => {
    updateValue(customValue);
    setOpen(false);
  };

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setQuery("");
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? id + "-options" : undefined}
            variant="outline"
            className={cn(
              "h-9 w-full justify-between px-3 text-left font-normal",
              value ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span className="truncate">{value || placeholder}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command shouldFilter>
            <CommandInput
              autoFocus
              aria-label="Buscar subclasse"
              placeholder="Digite para filtrar ou informar"
              value={query}
              onValueChange={(nextValue) => {
                setQuery(nextValue);
                onChange(nextValue);
              }}
            />
            <CommandList
              id={id + "-options"}
              aria-label="Sugestões de subclasse"
            >
              <CommandEmpty>Nenhuma sugestão para esta classe.</CommandEmpty>
              {suggestions.length > 0 && (
                <CommandGroup>
                  {suggestions.map((suggestion) => (
                    <CommandItem
                      key={suggestion}
                      value={suggestion}
                      onSelect={() => {
                        updateValue(suggestion);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          value === suggestion ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {suggestion}
                    </CommandItem>
                  ))}
                  {customValue && !hasExactSuggestion && (
                    <CommandItem
                      value={"Usar " + customValue}
                      onSelect={chooseCustomValue}
                    >
                      Usar “{customValue}”
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
              {suggestions.length === 0 && customValue && (
                <CommandGroup>
                  <CommandItem
                    value={"Usar " + customValue}
                    onSelect={chooseCustomValue}
                  >
                    Usar “{customValue}”
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
