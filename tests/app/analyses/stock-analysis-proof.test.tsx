// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StockAnalysisProof } from "@/app/analyses/_components/stock-analysis-proof";

describe("StockAnalysisProof", () => {
  it("honors Retry-After before allowing another request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "temporarily unavailable" }), {
          status: 429,
          headers: {
            "retry-after": "60",
            "content-type": "application/json",
          },
        }),
      ),
    );
    render(<StockAnalysisProof />);
    const retry = await screen.findByRole("button", {
      name: /tente novamente em 60s/i,
    });
    expect(retry.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
