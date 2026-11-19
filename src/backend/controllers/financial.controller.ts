import { financialService } from "@/backend/services/financial.service";
import { logger } from "@/infrastructure/logging/logger";

export class FinancialController {
  async getCategories(requestId: string) {
    const categories = await financialService.listCategories();
    logger.info("financial_categories_loaded", {
      requestId,
      count: categories.length,
    });
    return Response.json({ categories });
  }

  async getEntries(month: string | null, requestId: string) {
    const data = await financialService.listEntries(month);
    logger.info("financial_entries_loaded", {
      requestId,
      count: data.entries.length,
      month: data.month,
    });
    return Response.json(data);
  }

  async createEntry(body: unknown, requestId: string) {
    const entry = await financialService.createEntry(body);
    logger.info("financial_entry_created", {
      requestId,
      entryId: entry.id,
      kind: entry.kind,
    });
    return Response.json(
      { ...entry, message: "Lançamento cadastrado." },
      { status: 201 },
    );
  }

  async updateEntry(body: unknown, requestId: string) {
    const entry = await financialService.updateEntry(body);
    logger.info("financial_entry_updated", {
      requestId,
      entryId: entry.id,
      kind: entry.kind,
    });
    return Response.json({ ...entry, message: "Lançamento atualizado." });
  }

  async deleteEntry(id: string | null, requestId: string) {
    const entry = await financialService.deleteEntry(id);
    logger.info("financial_entry_deleted", { requestId, entryId: entry.id });
    return Response.json({ ...entry, message: "Lançamento excluído." });
  }

  async getOverview(month: string | null, requestId: string) {
    const data = await financialService.getMonthlyOverview(month);
    logger.info("financial_overview_loaded", {
      requestId,
      month: data.month,
      completeness: data.summary.completeness,
    });
    return Response.json(data);
  }

  async closeMonth(body: unknown, requestId: string) {
    const data = await financialService.closeMonth(body);
    logger.info("financial_month_closed", {
      requestId,
      month: data.month,
      status: data.close.status,
      closedAt: data.close.closedAt,
    });
    return Response.json({ ...data, message: "Mês fechado." });
  }

  async simulateMonthlyCapacity(body: unknown, requestId: string) {
    const data = await financialService.simulateMonthlyCapacity(body);
    logger.info("financial_capacity_simulated", {
      requestId,
      month: data.month,
      status: data.status,
    });
    return Response.json(data);
  }
}

export const financialController = new FinancialController();
