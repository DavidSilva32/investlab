import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import {
  portfolioAssetClassOptions,
  portfolioAssetGeographyOptions,
} from "@/backend/services/portfolio-classification";
import { logger } from "@/infrastructure/logging/logger";

const classificationSchema = z.object({
  positionId: z.string().uuid(),
  assetClass: z.enum(portfolioAssetClassOptions).nullable(),
  subClass: z.string().trim().max(120).nullable(),
  geography: z.enum(portfolioAssetGeographyOptions).nullable(),
});

export class PortfolioAllocationController {
  async get(requestId: string) {
    const positions = await portfolioAllocationService.getAllocation(requestId);
    logger.info("portfolio_allocation_responded", {
      requestId,
      positions: positions.length,
    });
    return Response.json({ positions });
  }

  async update(request: Request, requestId: string) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApplicationError("O corpo da solicitação é inválido.", 400);
    }
    const parsed = classificationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError("Revise os campos da classificação.", 400);
    }
    await portfolioAllocationService.updateClassification(
      parsed.data,
      requestId,
    );
    return Response.json({ message: "Classificação salva." });
  }
}

export const portfolioAllocationController =
  new PortfolioAllocationController();
