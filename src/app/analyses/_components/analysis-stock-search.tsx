"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

type TickerOption = { ticker: string; name: string };

export function AnalysisStockSearch({
  ticker,
  onSelect,
  showDescription = true,
}: {
  ticker: string;
  onSelect: (option: TickerOption) => void;
  showDescription?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(ticker);
  const [queryTicker, setQueryTicker] = useState(ticker);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const tickerIsSynchronized = queryTicker === ticker;
  const canSearch =
    tickerIsSynchronized &&
    query.trim().length >= 2 &&
    query.trim().toUpperCase() !== ticker;
  const normalizedQuery = debouncedQuery.trim();
  const debouncing = canSearch && normalizedQuery !== query.trim();
  const searchQuery = useQuery({
    queryKey: queryKeys.analyses.search(normalizedQuery),
    enabled:
      tickerIsSynchronized &&
      normalizedQuery.length >= 2 &&
      normalizedQuery.toUpperCase() !== ticker,
    queryFn: async ({ signal }) => {
      const body = await apiRequest<{ results?: TickerOption[] }>(
        `/api/analyses/stocks/search?q=${encodeURIComponent(normalizedQuery)}`,
        { signal },
        "Não foi possível pesquisar ações agora.",
      );
      const seenTickers = new Set<string>();
      return (body.results ?? []).filter((option) => {
        const normalizedTicker = option.ticker.toUpperCase();
        if (seenTickers.has(normalizedTicker)) return false;
        seenTickers.add(normalizedTicker);
        return true;
      });
    },
  });
  const options = canSearch && !debouncing ? (searchQuery.data ?? []) : [];
  const searching = debouncing || searchQuery.isFetching;
  const searchError =
    canSearch && searchQuery.error instanceof Error
      ? searchQuery.error.message
      : null;

  useEffect(() => {
    inputRef.current?.setAttribute("aria-expanded", String(open && canSearch));
  });

  useEffect(() => {
    if (tickerIsSynchronized) return;
    const timer = window.setTimeout(() => {
      setQueryTicker(ticker);
      setQuery(ticker);
      setOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ticker, tickerIsSynchronized]);

  useEffect(() => {
    if (!tickerIsSynchronized) return;
    const normalized = query.trim();
    if (normalized.length < 2 || normalized.toUpperCase() === ticker) return;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(normalized);
      setOpen(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, ticker, tickerIsSynchronized]);

  function select(option: TickerOption) {
    setQuery(option.ticker);
    setOpen(false);
    onSelect(option);
  }

  return (
    <Command
      label="Pesquisar ação"
      shouldFilter={false}
      className="overflow-visible bg-transparent"
    >
      <Popover open={open && canSearch} onOpenChange={setOpen}>
        <div className="relative z-20 w-full">
          <span className="mb-1.5 block text-sm font-medium">
            Pesquisar ação
          </span>
          <PopoverAnchor asChild>
            <div>
              <CommandInput
                ref={inputRef}
                id="analysis-stock-search"
                aria-label="Pesquisar ação"
                aria-expanded={open && canSearch}
                value={query}
                placeholder="Busque por ticker ou nome da empresa"
                onFocus={() => options.length > 0 && setOpen(true)}
                onValueChange={(value) => {
                  setQuery(value);
                  setOpen(true);
                }}
              />
            </div>
          </PopoverAnchor>
          {showDescription && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              A busca consulta o catálogo de ações retornado pela fonte de
              mercado.
            </p>
          )}
        </div>
        <PopoverContent
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <CommandList aria-label="Ações encontradas">
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
                {searchError}
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
