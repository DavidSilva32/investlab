import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  screenerSecurities,
  studyListEntries,
  studyListObservations,
} from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";

export type StudyListObservationInput = {
  issuerCnpj: string;
  text: string;
};

export class StudyListRepository {
  async list() {
    const database = getDatabaseClient();
    const entries = await database
      .select()
      .from(studyListEntries)
      .orderBy(asc(studyListEntries.addedAt));
    if (entries.length === 0) return [];

    const cnpjs = entries.map((entry) => entry.issuerCnpj);
    const [observations, securities] = await Promise.all([
      database
        .select()
        .from(studyListObservations)
        .where(inArray(studyListObservations.issuerCnpj, cnpjs))
        .orderBy(asc(studyListObservations.createdAt)),
      database
        .select({
          issuerCnpj: screenerSecurities.issuerCnpj,
          ticker: screenerSecurities.ticker,
        })
        .from(screenerSecurities)
        .where(
          and(
            inArray(screenerSecurities.issuerCnpj, cnpjs),
            eq(screenerSecurities.subType, "stock"),
            eq(screenerSecurities.isActive, true),
            isNull(screenerSecurities.baseTicker),
          ),
        ),
    ]);

    return entries.map((entry) => ({
      ...entry,
      observations: observations.filter(
        (observation) => observation.issuerCnpj === entry.issuerCnpj,
      ),
      availableTickers: [
        ...new Set([
          ...securities
            .filter((security) => security.issuerCnpj === entry.issuerCnpj)
            .map((security) => security.ticker),
          ...(entry.ticker ? [entry.ticker] : []),
        ]),
      ],
    }));
  }

  async updateReason(input: { issuerCnpj: string; reason: string }) {
    const [entry] = await getDatabaseClient()
      .update(studyListEntries)
      .set({ reason: input.reason })
      .where(eq(studyListEntries.issuerCnpj, input.issuerCnpj))
      .returning({ issuerCnpj: studyListEntries.issuerCnpj });
    return entry ?? null;
  }

  async remove(issuerCnpj: string) {
    const [entry] = await getDatabaseClient()
      .delete(studyListEntries)
      .where(eq(studyListEntries.issuerCnpj, issuerCnpj))
      .returning({ issuerCnpj: studyListEntries.issuerCnpj });
    return Boolean(entry);
  }

  async addObservation(input: StudyListObservationInput) {
    const [entry] = await getDatabaseClient()
      .select({ issuerCnpj: studyListEntries.issuerCnpj })
      .from(studyListEntries)
      .where(eq(studyListEntries.issuerCnpj, input.issuerCnpj))
      .limit(1);
    if (!entry) return null;

    const [observation] = await getDatabaseClient()
      .insert(studyListObservations)
      .values(input)
      .returning();
    return observation ?? null;
  }

  async updateObservation(input: {
    issuerCnpj: string;
    observationId: string;
    text: string;
  }) {
    const [observation] = await getDatabaseClient()
      .update(studyListObservations)
      .set({ text: input.text, updatedAt: new Date() })
      .where(
        and(
          eq(studyListObservations.issuerCnpj, input.issuerCnpj),
          eq(studyListObservations.id, input.observationId),
        ),
      )
      .returning();
    return observation ?? null;
  }
}

export const studyListRepository = new StudyListRepository();
