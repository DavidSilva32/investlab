import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import {
  portfolioAssetClassOptions,
  portfolioAssetGeographyOptions,
} from "@/lib/portfolio-classification-options";
import { logger } from "@/infrastructure/logging/logger";
import { isValidPortfolioAllocationTargets } from "@/lib/portfolio-allocation-target-values";

const classificationSchema = z
  .object({
    positionId: z.string().uuid().optional(),
    positionIds: z.array(z.string().uuid()).min(1).optional(),
    assetClass: z.enum(portfolioAssetClassOptions).nullable().optional(),
    subClass: z.string().trim().max(120).nullable().optional(),
    geography: z.enum(portfolioAssetGeographyOptions).nullable().optional(),
  })
  .refine((input) => Boolean(input.positionId) !== Boolean(input.positionIds), {
    message: "Informe uma posição ou uma lista de posições.",
  })
  .refine(
    (input) =>
      input.assetClass !== undefined ||
      input.subClass !== undefined ||
      input.geography !== undefined,
    { message: "Informe ao menos um campo para atualizar." },
  )
  .refine(
    (input) =>
      input.positionIds === undefined ||
      new Set(input.positionIds).size === input.positionIds.length,
    { message: "A lista de posições não pode conter itens repetidos." },
  );

export class PortfolioAllocationController {
  async get(requestId: string) {
    const positions = await portfolioAllocationService.getAllocation(requestId);
    const targetPercentages =
      await portfolioAllocationService.getAllocationTargets(requestId);
    logger.info("portfolio_allocation_responded", {
      requestId,
      positions: positions.length,
    });
    return Response.json({ positions, targetPercentages });
  }

  async updateTargets(request: Request, requestId: string) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApplicationError("O corpo da solicitação é inválido.", 400);
    }
    const targets =
      typeof body === "object" && body !== null && "targetPercentages" in body
        ? (body as { targetPercentages?: unknown }).targetPercentages
        : undefined;
    if (!isValidPortfolioAllocationTargets(targets)) {
      throw new ApplicationError("Revise as metas de alocação.", 400);
    }
    const saved = await portfolioAllocationService.updateAllocationTargets(
      targets as Record<string, number>,
      requestId,
    );
    return Response.json({
      message: "Metas de alocação salvas.",
      targetPercentages: saved,
    });
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
    const result = await portfolioAllocationService.updateClassifications(
      {
        positionIds: parsed.data.positionIds ?? [parsed.data.positionId!],
        ...(parsed.data.assetClass !== undefined && {
          assetClass: parsed.data.assetClass,
        }),
        ...(parsed.data.subClass !== undefined && {
          subClass: parsed.data.subClass,
        }),
        ...(parsed.data.geography !== undefined && {
          geography: parsed.data.geography,
        }),
      },
      requestId,
    );
    return Response.json({ message: "Classificação salva.", ...result });
  }
}

export const portfolioAllocationController =
  new PortfolioAllocationController();
