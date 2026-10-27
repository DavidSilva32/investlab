import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

const database = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { FinancialRepository } from "@/backend/repositories/financial.repository";

describe("FinancialRepository", () => {
  const repository = new FinancialRepository();

  beforeEach(() => vi.resetAllMocks());

  it("lists shared defaults and owner categories through owner preferences", async () => {
    const rows = [{ id: "default", userId: null, name: "Salário" }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_categories");
      return { leftJoin };
    });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-a", () => repository.listCategories()),
    ).resolves.toEqual(rows);
    expect(database.select).toHaveBeenCalledOnce();
    expect(leftJoin).toHaveBeenCalledOnce();
    const predicate = where.mock.calls[0][0];
    expect(new PgDialect().sqlToQuery(predicate).params).toContain("owner-a");
  });

  it("creates a user-owned category", async () => {
    const row = { id: "category" };
    const returning = vi.fn().mockResolvedValue([row]);
    const values = vi.fn().mockReturnValue({ returning });
    database.insert.mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_categories");
      return { values };
    });

    await expect(
      runWithDataOwner("owner-b", () =>
        repository.createCategory({ kind: "EXPENSE", name: "Pets" }),
      ),
    ).resolves.toEqual(row);
    expect(values).toHaveBeenCalledWith({
      kind: "EXPENSE",
      name: "Pets",
      userId: "owner-b",
      isDefault: false,
    });
  });

  it("updates, deactivates, and upserts categories with owner predicates", async () => {
    const row = { id: "category" };
    const returning = vi.fn().mockResolvedValue([row]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    database.update.mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_categories");
      return { set };
    });

    await expect(
      runWithDataOwner("owner-c", () =>
        repository.updateOwnedCategory("category-id", {
          kind: "EXPENSE",
          name: "Casa",
        }),
      ),
    ).resolves.toEqual(row);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toContain(
      "owner-c",
    );

    await expect(
      runWithDataOwner("owner-c", () =>
        repository.setOwnedCategoryActive("category-id", true),
      ),
    ).resolves.toEqual(row);
    returning.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-c", () =>
        repository.setOwnedCategoryActive("missing", false),
      ),
    ).resolves.toBeNull();

    returning.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-c", () =>
        repository.updateOwnedCategory("missing", {
          kind: "EXPENSE",
          name: "Casa",
        }),
      ),
    ).resolves.toBeNull();

    const preferenceRows = [
      {
        id: "default-category",
        userId: null,
        kind: "INCOME",
        name: "Renda principal",
        originalName: "Salário",
        isDefault: true,
        active: true,
      },
    ];
    const orderBy = vi.fn().mockResolvedValue(preferenceRows);
    const categoryWhere = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where: categoryWhere });
    const from = vi.fn().mockReturnValue({ leftJoin });
    database.select.mockReturnValue({ from });
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert.mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_category_preferences");
      return { values };
    });

    await expect(
      runWithDataOwner("owner-c", () =>
        repository.saveDefaultCategoryPreference("default-category", {
          nameOverride: "Renda principal",
          active: true,
        }),
      ),
    ).resolves.toEqual(preferenceRows[0]);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-c",
        categoryId: "default-category",
        nameOverride: "Renda principal",
      }),
    );
    orderBy.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-c", () =>
        repository.saveDefaultCategoryPreference("missing-category", {
          nameOverride: null,
          active: false,
        }),
      ),
    ).resolves.toBeNull();
  });

  it("lists entries within expected or actual dates for the active owner", async () => {
    const rows = [{ id: "entry" }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where });
    const innerJoin = vi.fn().mockReturnValue({ leftJoin });
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_entries");
      return { innerJoin };
    });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-d", () =>
        repository.listEntries("2026-10-01", "2026-10-31"),
      ),
    ).resolves.toEqual(rows);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual(
      expect.arrayContaining(["owner-d", "2026-10-01", "2026-10-31"]),
    );
  });

  it("finds entries only for the current owner and returns null for missing rows", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "entry" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_entries");
      return { where };
    });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-e", () => repository.findEntry("entry-id")),
    ).resolves.toEqual({ id: "entry" });
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toContain(
      "owner-e",
    );
    limit.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-e", () => repository.findEntry("missing")),
    ).resolves.toBeNull();
  });

  it("finds a shared or owner category and returns null when it is unavailable", async () => {
    const rows = [{ id: "category-id" }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ leftJoin });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-find", () =>
        repository.findCategory("category-id"),
      ),
    ).resolves.toEqual(rows[0]);
    orderBy.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-find", () =>
        repository.findCategory("missing-category"),
      ),
    ).resolves.toBeNull();
  });

  it("creates and updates financial entries as owner-scoped writes", async () => {
    const row = { id: "entry" };
    const returning = vi.fn().mockResolvedValue([row]);
    const values = vi.fn().mockReturnValue({ returning });
    database.insert.mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_entries");
      return { values };
    });
    const input = {
      kind: "EXPENSE",
      description: "Luz",
      categoryId: "category-id",
      expectedAmount: "100.00",
      expectedDate: "2026-10-10",
      actualAmount: null,
      actualDate: null,
    };
    await expect(
      runWithDataOwner("owner-f", () => repository.createEntry(input)),
    ).resolves.toEqual(row);
    expect(values).toHaveBeenCalledWith({ ...input, userId: "owner-f" });

    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    database.update.mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_entries");
      return { set };
    });
    await expect(
      runWithDataOwner("owner-f", () =>
        repository.updateEntry("entry-id", input),
      ),
    ).resolves.toEqual(row);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toContain(
      "owner-f",
    );
    returning.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-f", () =>
        repository.updateEntry("missing", input),
      ),
    ).resolves.toBeNull();
  });

  it("deletes only an entry belonging to the active owner", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "entry-id" }]);
    const where = vi.fn().mockReturnValue({ returning });
    database.delete.mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_entries");
      return { where };
    });
    await expect(
      runWithDataOwner("owner-g", () => repository.deleteEntry("entry-id")),
    ).resolves.toEqual({ id: "entry-id" });
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toContain(
      "owner-g",
    );
    returning.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-g", () => repository.deleteEntry("missing")),
    ).resolves.toBeNull();
  });
});
