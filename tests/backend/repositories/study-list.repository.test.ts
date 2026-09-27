import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => client,
}));

import { StudyListRepository } from "@/backend/repositories/study-list.repository";

describe("StudyListRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty list without querying related rows", async () => {
    const orderBy = vi.fn().mockResolvedValue([]);
    client.select.mockReturnValue({
      from: () => ({ orderBy }),
    });

    await expect(new StudyListRepository().list()).resolves.toEqual([]);
    expect(client.select).toHaveBeenCalledOnce();
  });

  it("joins notes and active screener tickers by issuer CNPJ", async () => {
    const entries = [
      {
        issuerCnpj: "12345678000199",
        companyName: "Empresa exemplo",
        ticker: "EXMP3",
        reason: "Analisar o negócio.",
        addedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      {
        issuerCnpj: "12345678000270",
        companyName: "Sem ticker",
        ticker: null,
        reason: "Acompanhar dados oficiais.",
        addedAt: new Date("2026-09-02T00:00:00.000Z"),
      },
    ];
    const observation = {
      id: "note-1",
      issuerCnpj: entries[0]!.issuerCnpj,
      text: "Nota anterior.",
      createdAt: new Date("2026-09-03T00:00:00.000Z"),
      updatedAt: new Date("2026-09-03T00:00:00.000Z"),
    };
    client.select
      .mockReturnValueOnce({
        from: () => ({ orderBy: () => Promise.resolve(entries) }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ orderBy: () => Promise.resolve([observation]) }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              { issuerCnpj: entries[0]!.issuerCnpj, ticker: "EXMP3" },
              { issuerCnpj: entries[0]!.issuerCnpj, ticker: "EXMP4" },
            ]),
        }),
      });

    await expect(new StudyListRepository().list()).resolves.toEqual([
      {
        ...entries[0],
        observations: [observation],
        availableTickers: ["EXMP3", "EXMP4"],
      },
      {
        ...entries[1],
        observations: [],
        availableTickers: [],
      },
    ]);
  });

  it("adds once per CNPJ and treats a duplicate as an unchanged entry", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ issuerCnpj: "12345678000199" }])
      .mockResolvedValueOnce([]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    client.insert.mockReturnValue({ values });

    const repository = new StudyListRepository();
    const input = {
      issuerCnpj: "12345678000199",
      companyName: "Empresa exemplo",
      ticker: "EXMP3",
      reason: "Analisar o negócio.",
    };
    await expect(repository.add(input)).resolves.toBe(true);
    await expect(repository.add(input)).resolves.toBe(false);
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: expect.anything(),
    });
  });

  it("updates an inclusion reason by issuer CNPJ and returns null if absent", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ issuerCnpj: "12345678000199" }])
      .mockResolvedValueOnce([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    client.update.mockReturnValue({ set });

    const repository = new StudyListRepository();
    await expect(
      repository.updateReason({
        issuerCnpj: "12345678000199",
        reason: "Motivo atualizado.",
      }),
    ).resolves.toEqual({ issuerCnpj: "12345678000199" });
    await expect(
      repository.updateReason({
        issuerCnpj: "12345678000199",
        reason: "Motivo atualizado.",
      }),
    ).resolves.toBeNull();
    expect(set).toHaveBeenCalledWith({ reason: "Motivo atualizado." });
  });

  it("returns whether a list entry was removed", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ issuerCnpj: "12345678000199" }])
      .mockResolvedValueOnce([]);
    const where = vi.fn().mockReturnValue({ returning });
    client.delete.mockReturnValue({ where });

    const repository = new StudyListRepository();
    await expect(repository.remove("12345678000199")).resolves.toBe(true);
    await expect(repository.remove("12345678000199")).resolves.toBe(false);
  });

  it("only creates observations for an existing issuer entry", async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ issuerCnpj: "12345678000199" }])
      .mockResolvedValueOnce([{ issuerCnpj: "12345678000199" }]);
    client.select.mockReturnValue({
      from: () => ({ where: () => ({ limit }) }),
    });
    const observation = {
      id: "note-1",
      issuerCnpj: "12345678000199",
      text: "Primeira nota.",
      createdAt: new Date("2026-09-04T00:00:00.000Z"),
      updatedAt: new Date("2026-09-04T00:00:00.000Z"),
    };
    const returning = vi
      .fn()
      .mockResolvedValueOnce([observation])
      .mockResolvedValueOnce([]);
    const values = vi.fn().mockReturnValue({ returning });
    client.insert.mockReturnValue({ values });

    const repository = new StudyListRepository();
    await expect(
      repository.addObservation({
        issuerCnpj: "12345678000199",
        text: "Primeira nota.",
      }),
    ).resolves.toBeNull();
    await expect(
      repository.addObservation({
        issuerCnpj: "12345678000199",
        text: "Primeira nota.",
      }),
    ).resolves.toEqual(observation);
    expect(client.insert).toHaveBeenCalledOnce();
    await expect(
      repository.addObservation({
        issuerCnpj: "12345678000199",
        text: "Nota adicional.",
      }),
    ).resolves.toBeNull();
  });

  it("updates an observation only under its issuer and returns null when absent", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "note-1",
          issuerCnpj: "12345678000199",
          text: "Nota atualizada.",
        },
      ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    client.update.mockReturnValue({ set });

    const repository = new StudyListRepository();
    const input = {
      issuerCnpj: "12345678000199",
      observationId: "note-1",
      text: "Nota atualizada.",
    };
    await expect(repository.updateObservation(input)).resolves.toBeNull();
    await expect(repository.updateObservation(input)).resolves.toMatchObject({
      text: "Nota atualizada.",
    });
    expect(set).toHaveBeenCalledWith({
      text: "Nota atualizada.",
      updatedAt: expect.any(Date),
    });
  });
});
