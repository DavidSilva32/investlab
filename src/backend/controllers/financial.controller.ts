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

  async createCategory(body: unknown, requestId: string) {
    const category = await financialService.createCategory(body);
    logger.info("financial_category_created", {
      requestId,
      categoryId: category.id,
    });
    return Response.json(
      { ...category, message: "Categoria cadastrada." },
      { status: 201 },
    );
  }

  async updateCategory(body: unknown, requestId: string) {
    const category = await financialService.updateCategory(body);
    logger.info("financial_category_updated", {
      requestId,
      categoryId: category?.id,
    });
    return Response.json({
      ...category,
      message: "Categoria atualizada.",
    });
  }

  async deleteCategory(id: string | null, requestId: string) {
    const category = await financialService.deleteCategory(id);
    logger.info("financial_category_deactivated", {
      requestId,
      categoryId: category?.id,
    });
    return Response.json({
      ...category,
      message: "Categoria desativada.",
    });
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
}

export const financialController = new FinancialController();
