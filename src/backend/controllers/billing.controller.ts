import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  billingService,
  parseAsaasDateCreated,
} from "@/backend/services/billing.service";

const billingTypeSchema = z.literal("CREDIT_CARD");
const webhookSchema = z
  .object({
    id: z.string().min(1).max(128),
    event: z.string().min(1).max(64),
    dateCreated: z
      .string()
      .refine((value) => parseAsaasDateCreated(value) !== null),
    checkout: z
      .object({
        id: z.string().optional(),
        status: z.string().max(32).optional(),
        externalReference: z.string().max(200).optional(),
      })
      .passthrough()
      .optional(),
    payment: z
      .object({
        subscription: z.string().optional(),
        dueDate: z.iso.date().optional(),
      })
      .passthrough()
      .optional(),
    subscription: z
      .object({
        id: z.string().optional(),
        status: z.string().optional(),
        nextDueDate: z.iso.date().optional(),
        externalReference: z.string().max(200).nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

function errorResponse(error: unknown) {
  const expected = error instanceof ApplicationError;
  return Response.json(
    {
      message: expected
        ? error.message
        : "Não foi possível processar a solicitação de pagamento.",
    },
    {
      status: expected ? error.statusCode : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function isValidWebhookToken(
  received: string | null,
  expected: string | undefined,
) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export class BillingController {
  async get() {
    try {
      const response = Response.json(
        await billingService.getCurrentOwnerBilling(),
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  }

  async subscribe(request: Request) {
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { message: "Confira a forma de pagamento e tente novamente." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      const parsed = z
        .object({ billingType: billingTypeSchema })
        .strict()
        .safeParse(body);
      if (!parsed.success)
        return Response.json(
          { message: "Confira a forma de pagamento e tente novamente." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      return Response.json(
        await billingService.subscribeCurrentOwner(parsed.data.billingType),
        {
          status: 201,
          headers: { "Cache-Control": "no-store" },
        },
      );
    } catch (error) {
      return errorResponse(error);
    }
  }

  async cancel() {
    try {
      const response = Response.json(
        await billingService.cancelCurrentOwnerSubscription(),
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  }

  async webhook(request: Request) {
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (
      !isValidWebhookToken(
        request.headers.get("asaas-access-token"),
        expectedToken,
      )
    )
      return Response.json(
        { message: "Webhook não autorizado." },
        { status: 401 },
      );
    try {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return Response.json({ message: "Evento inválido." }, { status: 400 });
      }
      const parsed = webhookSchema.safeParse(raw);
      if (!parsed.success)
        return Response.json({ message: "Evento inválido." }, { status: 400 });
      const result = await billingService.receiveAsaasWebhook({
        ...parsed.data,
        eventId: parsed.data.id,
      });
      return Response.json({ received: true, duplicate: result.duplicate });
    } catch {
      // A 5xx tells Asaas to retry; the database transaction keeps duplicates safe.
      return Response.json(
        { message: "Não foi possível receber o evento." },
        { status: 500 },
      );
    }
  }
}

export const billingController = new BillingController();
