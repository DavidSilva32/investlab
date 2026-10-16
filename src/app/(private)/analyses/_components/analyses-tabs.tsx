"use client";

import { useState } from "react";
import { BriefcaseBusiness, Search, Scale } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortfolioOpportunities } from "./portfolio-opportunities";
import { StockAnalysisDashboard } from "./stock-analysis-dashboard";
import { CompanyComparison } from "./company-comparison";

export function AnalysesTabs({
  initialTicker = "",
}: {
  initialTicker?: string;
}) {
  const portfolioInitiallySelected = !initialTicker;
  const [hasOpenedPortfolio, setHasOpenedPortfolio] = useState(
    portfolioInitiallySelected,
  );

  return (
    <Tabs
      defaultValue={initialTicker ? "individual" : "portfolio"}
      className="space-y-3"
      onValueChange={(value) => {
        if (value === "portfolio") setHasOpenedPortfolio(true);
      }}
    >
      <TabsList
        aria-label="Tipo de análise"
        className="grid h-auto w-full grid-cols-3 sm:inline-flex sm:w-auto"
      >
        <TabsTrigger value="portfolio" className="gap-2 px-4 py-2.5">
          <BriefcaseBusiness aria-hidden="true" className="size-4" />
          Minha carteira
        </TabsTrigger>
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
        value="portfolio"
        className="mt-0 data-[state=inactive]:hidden"
        forceMount
      >
        <PortfolioOpportunities enabled={hasOpenedPortfolio} />
      </TabsContent>
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
