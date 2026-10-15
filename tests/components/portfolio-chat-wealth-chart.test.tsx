// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioChatWealthChart } from "@/components/portfolio-chat-wealth-chart";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
  ChartTooltip: ({ content }: { content: React.ReactNode }) => <>{content}</>,
  ChartTooltipContent: ({
    formatter,
  }: {
    formatter: (value: number) => string;
  }) => <span data-testid="tooltip-value">{formatter(250)}</span>,
}));
vi.mock("recharts", () => ({
  Cell: ({ fill }: { fill: string }) => <span data-fill={fill} />,
  Pie: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  PieChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

afterEach(cleanup);

describe("PortfolioChatWealthChart", () => {
  it("renders the known destination values and accessible chart summary", () => {
    render(
      <PortfolioChatWealthChart
        knownTotal={10000}
        categories={[
          { key: "reserve", value: 2500, percentage: 25 },
          { key: "personal", value: 0, percentage: 0 },
          { key: "long_term", value: 7500, percentage: 75 },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: /total R\$\s*10\.000,00, por destino: Reserva, R\$\s*2\.500,00, 25,0%.*Investimento de longo prazo, R\$\s*7\.500,00, 75,0%/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("list", {
        name: "Distribuição do patrimônio por destino",
      }).textContent,
    ).toContain("Reserva");
    expect(screen.getByText("Patrimônio conhecido")).toBeTruthy();
    expect(screen.getByText("R$ 10.000,00").className).toContain("text-xs");
    expect(screen.getByText("R$ 10.000,00").className).toContain(
      "text-primary",
    );
    expect(screen.getByTestId("tooltip-value").textContent).toContain("250,00");
    expect(screen.queryByText("Objetivos pessoais")).toBeNull();
  });

  it("keeps the known total clear when no destination has a confirmed positive value", () => {
    render(
      <PortfolioChatWealthChart
        knownTotal={1250}
        categories={[
          { key: "reserve", value: 0, percentage: 0 },
          { key: "personal", value: Number.NaN, percentage: 0 },
        ]}
      />,
    );

    expect(screen.getByText("R$ 1.250,00").className).toContain("text-primary");
    expect(
      screen.getByText("Sem distribuição confirmada por destino."),
    ).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
