// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  DashboardNextAction,
  getDashboardNextAction,
} from "@/app/(private)/_components/dashboard-next-action";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";

const configuredReserve: EmergencyReserveCalculation = {
  monthlyExpenses: 1000,
  targetMonths: 3,
  balance: 3000,
  referenceDate: "2026-09-01",
  targetValue: 3000,
  coveredMonths: 3,
  difference: 0,
  progressPercentage: 100,
  status: "on_target",
};

describe("DashboardNextAction", () => {
  afterEach(cleanup);

  it("offers import when there are no positions", () => {
    expect(
      getDashboardNextAction({ positionCount: 0, missingValueCount: 0 })?.href,
    ).toBe("/?openImport=1");
  });

  it("offers position review when values are missing", () => {
    expect(
      getDashboardNextAction({ positionCount: 2, missingValueCount: 1 })?.href,
    ).toBe("/carteira?view=positions");
  });

  it("offers reserve setup when monthly expenses are not configured", () => {
    expect(
      getDashboardNextAction({
        positionCount: 2,
        missingValueCount: 0,
        reserve: { ...configuredReserve, monthlyExpenses: null },
      })?.href,
    ).toBe(
      "/carteira?panel=objectives&objective=reserve&screen=reserve-settings",
    );
  });

  it("offers reserve setup when settings are marked unconfigured", () => {
    expect(
      getDashboardNextAction({
        positionCount: 2,
        missingValueCount: 0,
        reserve: {
          ...configuredReserve,
          status: "not_configured",
        },
      })?.kind,
    ).toBe("reserve-setup");
  });

  it("offers reserve review only for a known below-target difference", () => {
    expect(
      getDashboardNextAction({
        positionCount: 2,
        missingValueCount: 0,
        reserve: {
          ...configuredReserve,
          status: "below_target",
          difference: null,
        },
      }),
    ).toBeNull();

    expect(
      getDashboardNextAction({
        positionCount: 2,
        missingValueCount: 0,
        reserve: {
          ...configuredReserve,
          status: "below_target",
          difference: 100,
        },
      })?.href,
    ).toBe("/carteira?panel=objectives&objective=reserve");
  });

  it("has no redundant action when the portfolio and reserve are complete", () => {
    const action = getDashboardNextAction({
      positionCount: 2,
      missingValueCount: 0,
      reserve: configuredReserve,
    });
    expect(action).toBeNull();
    expect(renderToStaticMarkup(<DashboardNextAction action={action} />)).toBe(
      "",
    );
  });
});
