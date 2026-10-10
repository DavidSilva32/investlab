import { logger } from "@/infrastructure/logging/logger";
import { portfolioService } from "@/backend/services/portfolio.service";
import { ApplicationError } from "@/backend/errors/application-error";
import { z } from "zod";

const contributionSchema = z.object({
  contributionAmount: z
    .number()
    .finite()
    .positive()
    .max(1_000_000_000_000)
    .refine(
      (amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7,
      {
        message: "O valor deve ter no máximo duas casas decimais.",
      },
    ),
});
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export class PortfolioController {
  async calculateContribution(request: Request, requestId: string) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApplicationError("Informe um valor válido para o aporte.", 400);
    }
    const parsed = contributionSchema.safeParse(body);
    if (!parsed.success)
      throw new ApplicationError("Informe um valor válido para o aporte.", 400);
    const result = await portfolioService.calculateContribution(
      parsed.data.contributionAmount,
      requestId,
    );
    logger.info("portfolio_contribution_calculated", {
      requestId,
      status: result.status,
      strategySource: result.strategySource,
    });
    return Response.json(result);
  }

  async overview(requestId: string) {
    logger.info("portfolio_overview_requested", { requestId });
    const overview = await portfolioService.getOverview(requestId);
    logger.info("portfolio_overview_responded", {
      requestId,
      positions: overview.positions.length,
      movements: overview.movements.length,
    });
    return Response.json(overview);
  }

  async monthlyReview(request: Request, requestId: string) {
    const rawPeriod = new URL(request.url).searchParams.get("period");
    if (rawPeriod !== null && !monthSchema.safeParse(rawPeriod).success)
      throw new ApplicationError("Informe um mês válido para comparar.", 400);
    const review = await portfolioService.getMonthlyReview(
      rawPeriod,
      requestId,
    );
    logger.info("portfolio_monthly_review_responded", {
      requestId,
      period: review.selectedPeriod,
      status: review.status,
    });
    return Response.json(review);
  }
}

export const portfolioController = new PortfolioController();
