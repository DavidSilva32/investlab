"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortfolioOpportunities } from "./portfolio-opportunities";
import { StockAnalysisDashboard } from "./stock-analysis-dashboard";

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
      <TabsList aria-label="Tipo de análise">
        <TabsTrigger value="portfolio">Minha carteira</TabsTrigger>
        <TabsTrigger value="individual">Análise individual</TabsTrigger>
      </TabsList>
      <TabsContent value="portfolio" className="mt-0" forceMount>
        <PortfolioOpportunities enabled={hasOpenedPortfolio} />
      </TabsContent>
      <TabsContent value="individual" className="mt-0">
        <StockAnalysisDashboard initialTicker={initialTicker} />
      </TabsContent>
    </Tabs>
  );
}
