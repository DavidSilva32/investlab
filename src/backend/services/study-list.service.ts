import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  studyListRepository,
  type StudyListRepository,
} from "@/backend/repositories/study-list.repository";
import { logger } from "@/infrastructure/logging/logger";

const tickerPattern = /^[A-Z]{4}[0-9]{1,2}$/;
const addEntrySchema = z.object({
  issuerCnpj: z
    .string()
    .trim()
    .regex(/^\d{14}$/),
  companyName: z.string().trim().min(1).max(200),
  ticker: z.string().trim().toUpperCase().regex(tickerPattern).nullable(),
  reason: z.string().trim().min(1).max(1000),
});
const observationSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});
const observationIdSchema = z.string().uuid();

export class StudyListService {
  constructor(
    private readonly repository: Pick<
      StudyListRepository,
      | "list"
      | "add"
      | "remove"
      | "updateReason"
      | "addObservation"
      | "updateObservation"
    > = studyListRepository,
  ) {}

  async list(requestId?: string) {
    const entries = await this.repository.list();
    logger.info("study_list_loaded", { requestId, entryCount: entries.length });
    return entries;
  }

  async add(rawInput: unknown, requestId?: string) {
    const input = addEntrySchema.safeParse(rawInput);
    if (!input.success)
      throw new ApplicationError(
        "Informe uma empresa identificada pelo CNPJ, o motivo do estudo e um ticker válido quando disponível.",
        400,
      );

    const added = await this.repository.add(input.data);
    logger.info("study_list_entry_add_attempted", {
      requestId,
      added,
      hasTicker: input.data.ticker !== null,
    });
    return { added, issuerCnpj: input.data.issuerCnpj };
  }

  async updateReason(rawCnpj: unknown, rawInput: unknown, requestId?: string) {
    const cnpj = z
      .string()
      .regex(/^\d{14}$/)
      .safeParse(rawCnpj);
    const input = z
      .object({ reason: z.string().trim().min(1).max(1000) })
      .safeParse(rawInput);
    if (!cnpj.success || !input.success)
      throw new ApplicationError("Revise o motivo da inclusão.", 400);
    const entry = await this.repository.updateReason({
      issuerCnpj: cnpj.data,
      reason: input.data.reason,
    });
    if (!entry)
      throw new ApplicationError("A empresa não está na Lista de estudo.", 404);
    logger.info("study_list_reason_updated", { requestId });
    return { issuerCnpj: cnpj.data, reason: input.data.reason };
  }

  async remove(rawCnpj: unknown, requestId?: string) {
    const cnpj = z
      .string()
      .regex(/^\d{14}$/)
      .safeParse(rawCnpj);
    if (!cnpj.success)
      throw new ApplicationError("Informe um CNPJ válido para remover.", 400);
    const removed = await this.repository.remove(cnpj.data);
    logger.info("study_list_entry_remove_attempted", {
      requestId,
      removed,
    });
    return { removed, issuerCnpj: cnpj.data };
  }

  async addObservation(
    rawCnpj: unknown,
    rawInput: unknown,
    requestId?: string,
  ) {
    const cnpj = z
      .string()
      .regex(/^\d{14}$/)
      .safeParse(rawCnpj);
    const input = observationSchema.safeParse(rawInput);
    if (!cnpj.success || !input.success)
      throw new ApplicationError("Revise o texto da observação.", 400);
    const observation = await this.repository.addObservation({
      issuerCnpj: cnpj.data,
      text: input.data.text,
    });
    if (!observation)
      throw new ApplicationError("A empresa não está na Lista de estudo.", 404);
    logger.info("study_list_observation_added", { requestId });
    return observation;
  }

  async updateObservation(
    rawCnpj: unknown,
    rawObservationId: unknown,
    rawInput: unknown,
    requestId?: string,
  ) {
    const cnpj = z
      .string()
      .regex(/^\d{14}$/)
      .safeParse(rawCnpj);
    const observationId = observationIdSchema.safeParse(rawObservationId);
    const input = observationSchema.safeParse(rawInput);
    if (!cnpj.success || !observationId.success || !input.success)
      throw new ApplicationError("Revise o texto da observação.", 400);
    const observation = await this.repository.updateObservation({
      issuerCnpj: cnpj.data,
      observationId: observationId.data,
      text: input.data.text,
    });
    if (!observation)
      throw new ApplicationError(
        "Não foi possível localizar essa observação nesta lista.",
        404,
      );
    logger.info("study_list_observation_updated", { requestId });
    return observation;
  }
}

export const studyListService = new StudyListService();
