import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";
import { StudyListService } from "@/backend/services/study-list.service";

const entry = {
  issuerCnpj: "12345678000199",
  companyName: "Empresa exemplo",
  ticker: "EXMP3",
  reason: "Analisar o negócio.",
};
const note = {
  id: "00000000-0000-4000-8000-000000000001",
  issuerCnpj: entry.issuerCnpj,
  text: "Nota manual.",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
};

describe("StudyListService", () => {
  it("returns the saved entries", async () => {
    const entries = [{ ...entry, observations: [note] }];
    const repository = {
      list: vi.fn().mockResolvedValue(entries),
      add: vi.fn(),
      remove: vi.fn(),
      updateReason: vi.fn(),
      addObservation: vi.fn(),
      updateObservation: vi.fn(),
    };
    await expect(
      new StudyListService(repository).list("request-1"),
    ).resolves.toBe(entries);
  });

  it("validates CNPJ identity and required reason, then preserves existing data on duplicates", async () => {
    const repository = {
      list: vi.fn(),
      add: vi.fn().mockResolvedValue(false),
      remove: vi.fn(),
      updateReason: vi.fn(),
      addObservation: vi.fn(),
      updateObservation: vi.fn(),
    };
    const service = new StudyListService(repository);
    await expect(
      service.add({ ...entry, issuerCnpj: "123" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("CNPJ"),
    });
    await expect(
      service.add({ ...entry, reason: "  " }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.add({ ...entry, ticker: "not-a-ticker" }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.add({ ...entry, ticker: null }, "request-2"),
    ).resolves.toEqual({
      added: false,
      issuerCnpj: entry.issuerCnpj,
    });
    expect(repository.add).toHaveBeenCalledOnce();
  });

  it("validates and updates a non-empty inclusion reason", async () => {
    const repository = {
      list: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      updateReason: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        issuerCnpj: entry.issuerCnpj,
      }),
      addObservation: vi.fn(),
      updateObservation: vi.fn(),
    };
    const service = new StudyListService(repository);
    await expect(
      service.updateReason("bad", { reason: "Motivo" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.updateReason(entry.issuerCnpj, { reason: "  " }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Revise o motivo da inclusão.",
    });
    await expect(
      service.updateReason(entry.issuerCnpj, { reason: "Motivo" }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "A empresa não está na Lista de estudo.",
    });
    await expect(
      service.updateReason(
        entry.issuerCnpj,
        { reason: "  Motivo atualizado.  " },
        "request-6",
      ),
    ).resolves.toEqual({
      issuerCnpj: entry.issuerCnpj,
      reason: "Motivo atualizado.",
    });
    expect(repository.updateReason).toHaveBeenLastCalledWith({
      issuerCnpj: entry.issuerCnpj,
      reason: "Motivo atualizado.",
    });
  });

  it("removes a valid CNPJ and rejects malformed identifiers", async () => {
    const repository = {
      list: vi.fn(),
      add: vi.fn(),
      remove: vi.fn().mockResolvedValue(true),
      updateReason: vi.fn(),
      addObservation: vi.fn(),
      updateObservation: vi.fn(),
    };
    const service = new StudyListService(repository);
    await expect(service.remove("123")).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.remove(entry.issuerCnpj, "request-3"),
    ).resolves.toEqual({
      removed: true,
      issuerCnpj: entry.issuerCnpj,
    });
  });

  it("adds observations only to a valid existing entry", async () => {
    const repository = {
      list: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      updateReason: vi.fn(),
      addObservation: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(note),
      updateObservation: vi.fn(),
    };
    const service = new StudyListService(repository);
    await expect(
      service.addObservation("bad", { text: "Nota" }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.addObservation(entry.issuerCnpj, { text: "  " }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.addObservation(entry.issuerCnpj, { text: "Nota manual." }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service.addObservation(
        entry.issuerCnpj,
        { text: "Nota manual." },
        "request-4",
      ),
    ).resolves.toEqual(note);
  });

  it("updates one observation without accepting invalid ids, empty text, or another issuer's note", async () => {
    const repository = {
      list: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      updateReason: vi.fn(),
      addObservation: vi.fn(),
      updateObservation: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(note),
    };
    const service = new StudyListService(repository);
    const validId = note.id;
    await expect(
      service.updateObservation("bad", validId, { text: "Atualizada" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.updateObservation(entry.issuerCnpj, "not-uuid", {
        text: "Atualizada",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.updateObservation(entry.issuerCnpj, validId, { text: " " }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.updateObservation(entry.issuerCnpj, validId, {
        text: "Nova nota.",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.updateObservation(
        entry.issuerCnpj,
        validId,
        { text: "Nota manual." },
        "request-5",
      ),
    ).resolves.toEqual(note);
  });
});
