import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { PrivacyCenterRepository } from "@/backend/repositories/privacy-center.repository";

describe("PrivacyCenterRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the requesting user's acceptance history newest first", async () => {
    const rows = [
      { termsVersion: "2026-10-17", acceptedAt: new Date("2026-10-17") },
    ];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    const repository = new PrivacyCenterRepository();

    await expect(repository.listTermsAcceptances("user-1")).resolves.toEqual(
      rows,
    );
    expect(database.select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalledOnce();
  });
});
