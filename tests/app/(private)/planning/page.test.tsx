import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
}));
vi.mock("@/app/(private)/planning/_components/planning-simulator", () => ({
  PlanningSimulator: ({
    initialObjectiveId,
  }: {
    initialObjectiveId: string | null;
  }) => <output>{initialObjectiveId ?? "sem objetivo"}</output>,
}));

import PlanningPage from "@/app/(private)/planning/page";

describe("PlanningPage", () => {
  it("passes the selected objective from the query string to the simulator", async () => {
    const element = await PlanningPage({
      searchParams: Promise.resolve({ objective: "goal-a" }),
    });

    expect(renderToStaticMarkup(element)).toContain("goal-a");
    expect(renderToStaticMarkup(element)).toContain("w-full space-y-5");
    expect(renderToStaticMarkup(element)).not.toContain("max-w-5xl");
  });

  it("starts without a selected objective when the query string is empty", async () => {
    const element = await PlanningPage({
      searchParams: Promise.resolve({}),
    });

    expect(renderToStaticMarkup(element)).toContain("sem objetivo");
  });
});
