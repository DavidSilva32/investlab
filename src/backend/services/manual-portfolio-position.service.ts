import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  manualPortfolioPositionRepository,
  type ManualPortfolioPositionInput,
} from "@/backend/repositories/manual-portfolio-position.repository";
import { logger } from "@/infrastructure/logging/logger";

const maximumAmount = 1_000_000_000_000;
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00Z");
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
const positionInputSchema = z
  .object({
    product: z.string().trim().min(1).max(160),
    assetCode: z.string().trim().max(24).optional().nullable(),
    institution: z.string().trim().max(160).optional().nullable(),
    quantity: z.number().finite().positive().max(maximumAmount),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
    valueBasis: z.enum(["unit_price", "total_value"]),
    unitPrice: z
      .number()
      .finite()
      .positive()
      .max(maximumAmount)
      .optional()
      .nullable(),
    totalValue: z
      .number()
      .finite()
      .positive()
      .max(maximumAmount)
      .optional()
      .nullable(),
    positionDate: dateSchema,
    convertedValueBrl: z
      .number()
      .finite()
      .positive()
      .max(maximumAmount)
      .optional()
      .nullable(),
    conversionDate: dateSchema.optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.valueBasis === "unit_price" && value.unitPrice == null) {
      context.addIssue({
        code: "custom",
        path: ["unitPrice"],
        message: "Informe o preço unitário.",
      });
    }
    if (value.valueBasis === "total_value" && value.totalValue == null) {
      context.addIssue({
        code: "custom",
        path: ["totalValue"],
        message: "Informe o valor total.",
      });
    }
    if (value.convertedValueBrl != null && value.currency === "BRL") {
      context.addIssue({
        code: "custom",
        path: ["convertedValueBrl"],
        message: "A posição em reais não precisa de conversão.",
      });
    }
    if ((value.convertedValueBrl == null) !== (value.conversionDate == null)) {
      context.addIssue({
        code: "custom",
        path: ["conversionDate"],
        message: "Informe a data junto com o valor convertido em reais.",
      });
    }
  });

function decimalValue(value: number) {
  return value.toFixed(8);
}

export function toPortfolioPosition(
  record: Awaited<
    ReturnType<typeof manualPortfolioPositionRepository.list>
  >[number],
) {
  const isBrl = record.currency === "BRL";
  const portfolioValue = isBrl ? record.totalValue : record.convertedValueBrl;
  return {
    id: record.id,
    assetKey: record.assetKey,
    source: "MANUAL" as const,
    product: record.product,
    assetCode: record.assetCode,
    institution: record.institution,
    issuer: null,
    indexer: null,
    regimeType: null,
    issuedAt: null,
    maturityAt: null,
    quantity: record.quantity,
    unitPrice: record.unitPrice,
    totalValue: portfolioValue,
    reportedTotalValue: record.totalValue,
    currency: record.currency,
    valueBasis: record.valueBasis,
    positionDate: record.positionDate,
    convertedValueBrl: record.convertedValueBrl,
    conversionDate: record.conversionDate,
    referenceDate: record.positionDate,
    availableQuantity: null,
    unavailableQuantity: null,
    valuationSource: "USER",
    estimationBaseDate: null,
    estimatedValue: null,
  };
}

export class ManualPortfolioPositionService {
  async list(requestId?: string) {
    const positions = await manualPortfolioPositionRepository.list(requestId);
    const counts = new Map<string, number>();
    for (const position of positions) {
      const key = position.assetCode?.toLocaleUpperCase("pt-BR");
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return positions.map((position) => ({
      ...toPortfolioPosition(position),
      duplicateAssetCode:
        position.assetCode !== null &&
        counts.get(position.assetCode.toLocaleUpperCase("pt-BR"))! > 1,
      lastUpdatedAt: position.updatedAt.toISOString(),
    }));
  }

  async create(body: unknown, requestId?: string) {
    const parsed = positionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Revise os dados informados para a posição.",
        400,
      );
    }
    const value = parsed.data;
    const id = randomUUID();
    const totalValue =
      value.valueBasis === "unit_price"
        ? value.quantity * value.unitPrice!
        : value.totalValue!;
    if (!Number.isFinite(totalValue) || totalValue > maximumAmount) {
      throw new ApplicationError("O valor total excede o limite aceito.", 400);
    }
    const input: ManualPortfolioPositionInput = {
      id,
      assetKey: "manual:" + id,
      product: value.product,
      assetCode: value.assetCode?.toLocaleUpperCase("pt-BR") || null,
      institution: value.institution || null,
      quantity: decimalValue(value.quantity),
      currency: value.currency,
      unitPrice:
        value.valueBasis === "unit_price"
          ? decimalValue(value.unitPrice!)
          : null,
      totalValue: decimalValue(totalValue),
      valueBasis: value.valueBasis,
      positionDate: value.positionDate,
      convertedValueBrl:
        value.convertedValueBrl == null
          ? null
          : decimalValue(value.convertedValueBrl),
      conversionDate: value.conversionDate ?? null,
    };
    const saved = await manualPortfolioPositionRepository.create(
      input,
      requestId,
    );
    logger.info("manual_portfolio_position_created", {
      requestId,
      positionId: saved.id,
    });
    return toPortfolioPosition(saved);
  }

  async update(id: string, body: unknown, requestId?: string) {
    const parsed = positionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Revise os dados informados para a posição.",
        400,
      );
    }
    const value = parsed.data;
    const totalValue =
      value.valueBasis === "unit_price"
        ? value.quantity * value.unitPrice!
        : value.totalValue!;
    if (!Number.isFinite(totalValue) || totalValue > maximumAmount) {
      throw new ApplicationError("O valor total excede o limite aceito.", 400);
    }
    const input = {
      product: value.product,
      assetCode: value.assetCode?.toLocaleUpperCase("pt-BR") || null,
      institution: value.institution || null,
      quantity: decimalValue(value.quantity),
      currency: value.currency,
      unitPrice:
        value.valueBasis === "unit_price"
          ? decimalValue(value.unitPrice!)
          : null,
      totalValue: decimalValue(totalValue),
      valueBasis: value.valueBasis,
      positionDate: value.positionDate,
      convertedValueBrl:
        value.convertedValueBrl == null
          ? null
          : decimalValue(value.convertedValueBrl),
      conversionDate: value.conversionDate ?? null,
    };
    const saved = await manualPortfolioPositionRepository.update(
      id,
      input,
      requestId,
    );
    if (!saved)
      throw new ApplicationError("Esta posição não existe mais.", 404);
    logger.info("manual_portfolio_position_updated", {
      requestId,
      positionId: saved.id,
    });
    return toPortfolioPosition(saved);
  }

  async delete(id: string, requestId?: string) {
    const deleted = await manualPortfolioPositionRepository.delete(
      id,
      requestId,
    );
    if (!deleted)
      throw new ApplicationError("Esta posição não existe mais.", 404);
    logger.info("manual_portfolio_position_deleted", {
      requestId,
      positionId: deleted.id,
    });
    return { id: deleted.id };
  }
}

export const manualPortfolioPositionService =
  new ManualPortfolioPositionService();
