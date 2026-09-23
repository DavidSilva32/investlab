"use client";

import { useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

type TickerOption = { ticker: string; name: string };

export function AnalysisStockSearch({
  ticker,
  onSelect,
}: {
  ticker: string;
  onSelect: (option: TickerOption) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState(ticker);
  const canSearch =
    query.trim().length >= 2 && query.trim().toUpperCase() !== ticker;
  const [options, setOptions] = useState<TickerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2 || normalized.toUpperCase() === ticker) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        const response = await fetch(
          `/api/analyses/stocks/search?q=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Ticker search failed");
        const body = (await response.json()) as { results: TickerOption[] };
        if (controller.signal.aborted) return;
        setOptions(body.results);
        setOpen(true);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setOptions([]);
        setOpen(true);
        setSearchError(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, ticker]);

  function select(option: TickerOption) {
    setQuery(option.ticker);
    setOpen(false);
    setOptions([]);
    onSelect(option);
  }

  return (
    <Command shouldFilter={false} className="overflow-visible bg-transparent">
      <Popover open={open && canSearch} onOpenChange={setOpen}>
        <div className="relative z-20 max-w-2xl">
          <label
            htmlFor="analysis-stock-search"
            className="mb-1.5 block text-sm font-medium"
          >
            Pesquisar ação
          </label>
          <PopoverAnchor asChild>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="analysis-stock-search"
                className="pl-9"
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open && canSearch}
                aria-controls={listId}
                value={query}
                placeholder="Busque por ticker ou nome da empresa"
                onFocus={() => options.length > 0 && setOpen(true)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOptions([]);
                  setSearchError(false);
                  setSearching(
                    event.target.value.trim().length >= 2 &&
                      event.target.value.trim().toUpperCase() !== ticker,
                  );
                  setOpen(true);
                }}
              />
            </div>
          </PopoverAnchor>
          <p className="mt-1.5 text-xs text-muted-foreground">
            A busca consulta o catálogo de ações retornado pela fonte de
            mercado.
          </p>
        </div>
        <PopoverContent
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] p-0"
        >
          <CommandList id={listId} aria-label="Ações encontradas">
            {searching && (
              <div
                className="px-3 py-2 text-sm text-muted-foreground"
                role="status"
              >
                Pesquisando ações...
              </div>
            )}
            {!searching && searchError && (
              <div
                className="px-3 py-2 text-sm text-muted-foreground"
                role="status"
              >
                Não foi possível pesquisar ações agora.
              </div>
            )}
            {!searching && !searchError && options.length === 0 && (
              <CommandEmpty>
                <span role="status">Nenhuma ação encontrada.</span>
              </CommandEmpty>
            )}
            {options.length > 0 && (
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.ticker}
                    value={`${option.ticker} ${option.name}`}
                    onSelect={() => select(option)}
                    className="justify-between gap-3"
                  >
                    <span className="font-semibold tabular-nums">
                      {option.ticker}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {option.name}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  );
}
