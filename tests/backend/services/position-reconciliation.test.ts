import { describe, expect, it } from "vitest";
import {
  activeReconciliationLinks,
  applyPositionReconciliation,
  getReconciliationCandidates,
  importedReconciliationKey,
  type ReconciliationEvent,
} from "@/backend/services/position-reconciliation";
const imported = {
  product: "Banco do Brasil",
  assetCode: "BBAS3",
  institution: "Corretora",
  totalValue: "1000",
};
const manual = {
  ...imported,
  assetKey: "manual:1",
  currency: "BRL",
  updatedAt: new Date("2026-01-01T12:00:00Z"),
};
const link: ReconciliationEvent = {
  id: "1",
  manualAssetKey: manual.assetKey,
  importedAssetKey: importedReconciliationKey(imported),
  status: "LINK",
  effectiveFrom: "2026-02-01",
  recordedAt: "2026-02-05T12:00:00Z",
};
describe("explicit source reconciliation", () => {
  it("requires a decision even for matching ticker, institution and exact cents", () => {
    expect(getReconciliationCandidates([imported], [manual])).toEqual([
      expect.objectContaining({
        status: "probable",
        manualValue: "1000",
        manualUpdatedAt: "2026-01-01T12:00:00.000Z",
      }),
    ]);
    expect(applyPositionReconciliation([imported], [manual], [])).toHaveLength(
      2,
    );
  });
  it("keeps differing share classes and unrelated products distinct", () => {
    expect(
      getReconciliationCandidates(
        [{ ...imported, assetCode: "BBAS4" }],
        [manual],
      ),
    ).toEqual([]);
    expect(
      getReconciliationCandidates(
        [{ product: "ABC" }],
        [{ product: "XYZ", assetKey: "manual:2" }],
      ),
    ).toEqual([]);
    expect(
      getReconciliationCandidates(
        [imported],
        [{ ...manual, assetKey: undefined }],
      ),
    ).toEqual([]);
  });
  it("marks different values, institutions and currencies as conflicts without inferring purchases", () => {
    expect(
      getReconciliationCandidates(
        [{ ...imported, totalValue: "1200", institution: "Outra" }],
        [{ ...manual, currency: "USD", updatedAt: "2026-01-02" }],
      )[0],
    ).toMatchObject({
      status: "conflict",
      reasons: [
        "different_institutions",
        "different_currency",
        "different_values",
      ],
      manualUpdatedAt: "2026-01-02",
    });
  });
  it("treats missing codes and valuations as incomplete evidence", () => {
    expect(
      getReconciliationCandidates(
        [{ product: "  FUNDO   EXEMPLO ", totalValue: null }],
        [{ product: "Fundo Exemplo", assetKey: "manual:2" }],
      )[0],
    ).toMatchObject({
      status: "probable",
      reasons: ["missing_code"],
      manualUpdatedAt: "",
      manualValue: null,
      importedValue: null,
      institution: null,
    });
    expect(
      getReconciliationCandidates(
        [{ ...imported, totalValue: "1" }],
        [{ ...manual, totalValue: null }],
      )[0].status,
    ).toBe("probable");
  });
  it("suggests the supplied manual CDB as a probable match using the normalized product without amount inference", () => {
    const importedCdb = {
      product: "CDB - BANCO INTER S/A",
      assetCode: "CDBA266ZVZV",
      institution: "BANCO INTER S/A",
      totalValue: "3000",
    };
    const manualCdb = {
      product: "CDB Banco Inter",
      assetCode: null,
      institution: "BANCO INTER S/A",
      totalValue: "3000",
      assetKey: "manual:cdb",
      updatedAt: "2026-10-01T12:00:00Z",
    };

    expect(getReconciliationCandidates([importedCdb], [manualCdb])).toEqual([
      expect.objectContaining({
        status: "probable",
        manualAssetCode: null,
        importedAssetCode: "CDBA266ZVZV",
        manualInstitution: "BANCO INTER S/A",
        institution: "BANCO INTER S/A",
        manualValue: "3000",
        importedValue: "3000",
        reasons: ["missing_code"],
      }),
    ]);
  });
  it("does not suggest different B3 certificate codes even when product labels match", () => {
    expect(
      getReconciliationCandidates(
        [{ ...imported, product: "CDB Banco Inter", assetCode: "CDB-2" }],
        [{ ...manual, product: "CDB Banco Inter", assetCode: "CDB-1" }],
      ),
    ).toEqual([]);
  });
  it("preserves instrument fields in the canonical identity", () => {
    const contract = {
      ...imported,
      issuer: "BANCO",
      indexer: "CDI",
      regimeType: "FIXO",
      issuedAt: "2025-01-01",
      maturityAt: "2027-01-01",
    };
    expect(importedReconciliationKey(contract)).not.toBe(
      importedReconciliationKey(imported),
    );
  });
  it("counts the B3 authoritative value once, keeping manual identity and origins", () => {
    const current = applyPositionReconciliation(
      [{ ...imported, totalValue: "1500" }],
      [manual],
      [link],
      "2026-02-28",
    );
    expect(current).toEqual([
      {
        ...imported,
        totalValue: "1500",
        assetKey: manual.assetKey,
        reconciliationOriginalAssetKey: link.importedAssetKey,
      },
    ]);
    expect(
      applyPositionReconciliation([], [manual], [link], "2026-02-28"),
    ).toEqual([]);
    expect(
      applyPositionReconciliation([imported], [{ product: "Other" }], [link]),
    ).toHaveLength(2);
  });
  it("preserves earlier snapshots and applies an effective dated reversal", () => {
    const reversal = {
      ...link,
      id: "2",
      status: "UNLINK" as const,
      effectiveFrom: "2026-03-01",
      recordedAt: new Date("2026-03-02"),
    };
    expect(
      applyPositionReconciliation(
        [imported],
        [manual],
        [link, reversal],
        "2026-01-31",
      ),
    ).toHaveLength(2);
    expect(
      applyPositionReconciliation(
        [imported],
        [manual],
        [reversal, link],
        "2026-02-28",
      ),
    ).toHaveLength(1);
    expect(
      applyPositionReconciliation(
        [imported],
        [manual],
        [link, reversal],
        "2026-03-31",
      ),
    ).toHaveLength(2);
  });
  it("uses deterministic event order and respects separate decisions", () => {
    const sameDate = { ...link, id: "2", status: "SEPARATE" as const };
    expect(activeReconciliationLinks([sameDate, link])).toEqual([]);
    const later = {
      ...link,
      id: "3",
      status: "UNLINK" as const,
      recordedAt: "2026-02-06",
    };
    expect(activeReconciliationLinks([later, link])).toEqual([]);
  });
});

it("keeps a link to one broker when the other broker is explicitly separate", () => {
  const other = { ...imported, institution: "Outra corretora" };
  const separate = {
    ...link,
    id: "2",
    importedAssetKey: importedReconciliationKey(other),
    status: "SEPARATE" as const,
  };
  expect(activeReconciliationLinks([separate, link])).toEqual([link]);
  expect(
    applyPositionReconciliation([imported, other], [manual], [link, separate]),
  ).toEqual([expect.objectContaining({ assetKey: manual.assetKey }), other]);
  expect(activeReconciliationLinks([{ ...separate, id: "0" }, link])).toEqual([
    link,
  ]);
});
