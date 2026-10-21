"use client";

import { Search, Scale } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockAnalysisDashboard } from "./stock-analysis-dashboard";
import { CompanyComparison } from "./company-comparison";

export function AnalysesTabs({
  initialTicker = "",
}: {
  initialTicker?: string;
}) {
  return (
    <Tabs defaultValue="individual" className="space-y-3">
      <TabsList
        aria-label="Tipo de análise"
        className="grid h-auto w-full grid-cols-2 sm:inline-flex sm:w-auto"
      >
        <TabsTrigger value="individual" className="gap-2 px-4 py-2.5">
          <Search aria-hidden="true" className="size-4" />
          Análise individual
        </TabsTrigger>
        <TabsTrigger value="comparison" className="gap-2 px-4 py-2.5">
          <Scale aria-hidden="true" className="size-4" />
          Comparar empresas
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="individual"
        className="mt-0 data-[state=inactive]:hidden"
      >
        <StockAnalysisDashboard initialTicker={initialTicker} />
      </TabsContent>
      <TabsContent
        value="comparison"
        className="mt-0 data-[state=inactive]:hidden"
      >
        <CompanyComparison initialTicker={initialTicker} />
      </TabsContent>
    </Tabs>
  );
}
