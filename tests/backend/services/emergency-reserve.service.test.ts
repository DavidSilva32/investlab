import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  listRecurrences: vi.fn(),
  listLatestBalanceReferences: vi.fn(),
}));

vi.mock("@/backend/repositories/emergency-reserve.repository", () => ({
  emergencyReserveRepository: {
    getSettings: mocks.getSettings,
    saveSettings: mocks.saveSettings,
  },
}));
vi.mock("@/backend/repositories/financial-recurrences.repository", () => ({
  financialRecurrencesRepository: { listRecurrences: mocks.listRecurrences },
}));
vi.mock("@/backend/repositories/portfolio-objectives.repository", () => ({
  portfolioObjectivesRepository: {
    listLatestBalanceReferences: mocks.listLatestBalanceReferences,
  },
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { EmergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

describe("EmergencyReserveService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: 1000,
      targetMonths: 6,
    });
    mocks.saveSettings.mockResolvedValue(undefined);
    mocks.listRecurrences.mockResolvedValue([]);
    mocks.listLatestBalanceReferences.mockResolvedValue([]);
  });

  it("returns just monthly expenses and the personal target settings", async () => {
    await expect(
      new EmergencyReserveService().getSettingsData(),
    ).resolves.toEqual({
      monthlyExpenses: 1000,
      targetMonths: 6,
    });
  });

  it("uses essential recurrences and the default horizon when settings are absent", async () => {
    mocks.getSettings.mockResolvedValue(null);
    mocks.listRecurrences.mockResolvedValue([
      {
        description: "Aluguel",
        amount: "1200.00",
        frequency: "MONTHLY",
        kind: "EXPENSE",
        essential: true,
        active: true,
      },
    ]);

    await expect(
      new EmergencyReserveService().getSettingsData(),
    ).resolves.toEqual({
      monthlyExpenses: 1200,
      targetMonths: 6,
    });
    const summary = await new EmergencyReserveService().getSummary();
    expect(summary).toMatchObject({
      monthlyExpenses: 1200,
      monthlyExpensesCents: "120000",
      targetMonths: 6,
      targetValue: 7200,
    });
  });

  it("uses the recurrence baseline when stored expenses are explicitly null", async () => {
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: null,
      targetMonths: null,
    });
    mocks.listRecurrences.mockResolvedValue([
      {
        description: "Condomínio",
        amount: "800.00",
        frequency: "MONTHLY",
        kind: "EXPENSE",
        essential: true,
        active: true,
      },
    ]);
    mocks.listLatestBalanceReferences.mockResolvedValue([
      {
        objectiveId: reserveObjectiveId,
        amountCents: "100000",
        observedDate: "2026-11-14",
      },
    ]);

    await expect(
      new EmergencyReserveService().getSummary(),
    ).resolves.toMatchObject({
      monthlyExpenses: 800,
      monthlyExpensesCents: "80000",
      targetMonths: 6,
      targetValue: 4800,
    });
  });

  it("treats an invalid legacy expense value as an unavailable cents total", async () => {
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "not-a-decimal",
      targetMonths: 6,
    });

    await expect(
      new EmergencyReserveService().getSummary(),
    ).resolves.toMatchObject({
      monthlyExpensesCents: null,
      targetMonths: 6,
      status: "balance_required",
    });
  });

  it("uses the latest reserve observation for coverage", async () => {
    mocks.listLatestBalanceReferences.mockResolvedValue([
      {
        objectiveId: reserveObjectiveId,
        amountCents: "1200000",
        observedDate: "2026-11-14",
      },
      {
        objectiveId: "other-goal",
        amountCents: "9900000",
        observedDate: "2026-11-14",
      },
    ]);

    const summary = await new EmergencyReserveService().getSummary("request-1");

    expect(summary).toMatchObject({
      hasObservedBalance: true,
      balanceCents: "1200000",
      balanceDate: "2026-11-14",
      coveredMonths: 12,
      targetValueCents: "600000",
      status: "above_target",
    });
    expect(mocks.listLatestBalanceReferences).toHaveBeenCalledOnce();
  });

  it("marks a reserve without an observation and withholds contribution context", async () => {
    const service = new EmergencyReserveService();

    await expect(service.getSummary()).resolves.toMatchObject({
      hasObservedBalance: false,
      balanceCents: null,
      balanceDate: null,
      balance: null,
      status: "balance_required",
    });
    await expect(service.getContributionContext()).resolves.toBeNull();
  });

  it("returns contribution context when an observed reserve balance exists", async () => {
    mocks.listLatestBalanceReferences.mockResolvedValue([
      {
        objectiveId: reserveObjectiveId,
        amountCents: "1200000",
        observedDate: "2026-11-14",
      },
    ]);

    await expect(
      new EmergencyReserveService().getContributionContext(),
    ).resolves.toMatchObject({
      hasObservedBalance: true,
      balanceCents: "1200000",
    });
  });

  it("saves validated settings and returns the persisted settings", async () => {
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "5000.00",
      targetMonths: 10,
    });
    const service = new EmergencyReserveService();

    await expect(
      service.saveSettings(
        { monthlyExpenses: 5000, targetMonths: 10 },
        "save-1",
      ),
    ).resolves.toEqual({ monthlyExpenses: 5000, targetMonths: 10 });
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      monthlyExpenses: "5000.00",
      targetMonths: 10,
    });
  });

  it("rejects malformed settings before persistence", async () => {
    await expect(
      new EmergencyReserveService().saveSettings({
        monthlyExpenses: 0,
        targetMonths: 0,
        selectedAssetKeys: ["legacy:key"],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Informe um custo mensal e uma meta em meses válidos.",
    } satisfies Partial<ApplicationError>);
    expect(mocks.saveSettings).not.toHaveBeenCalled();
  });
});
