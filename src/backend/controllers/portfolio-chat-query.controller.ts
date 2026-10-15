import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  portfolioChatQueryService,
  type PortfolioChatQuery,
} from "@/backend/services/portfolio-chat-query.service";
import { logger } from "@/infrastructure/logging/logger";

const requestSchema = z
  .object({
    intent: z.enum(["asset-value", "asset-class-value", "asset-list"]),
    query: z.string().trim().min(1).max(120).optional(),
    assetClassId: z
      .enum([
        "fixed_income",
        "brazilian_equities",
        "international_etfs",
        "fiis",
      ])
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.intent === "asset-value" && !value.query) {
      context.addIssue({
        code: "custom",
        path: ["query"],
        message: "Informe o ativo.",
      });
    }
    if (value.intent !== "asset-value" && !value.assetClassId) {
      context.addIssue({
        code: "custom",
        path: ["assetClassId"],
        message: "Informe a classe.",
      });
    }
  });

export class PortfolioChatQueryController {
  async post(request: Request, requestId: string) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApplicationError("Revise a pergunta enviada.", 400);
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApplicationError("Revise a pergunta enviada.", 400);
    const result = await portfolioChatQueryService.query(
      parsed.data as PortfolioChatQuery,
      requestId,
    );
    logger.info("portfolio_chat_query_completed", {
      requestId,
      intent: parsed.data.intent,
      resultCount: "items" in result ? (result.items?.length ?? 0) : 0,
    });
    return Response.json(result);
  }
}

export const portfolioChatQueryController = new PortfolioChatQueryController();
