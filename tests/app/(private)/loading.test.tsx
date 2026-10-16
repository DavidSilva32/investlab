// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const pageLoading = vi.hoisted(() => vi.fn(() => <div>loading</div>));
vi.mock("@/components/app-page-skeleton", () => ({
  AppPageSkeleton: pageLoading,
}));

import Loading from "@/app/(private)/loading";

describe("PrivateDashboardLoading", () => {
  it("uses the dashboard skeleton inside the authenticated route group", () => {
    renderToStaticMarkup(<Loading />);
    expect(pageLoading).toHaveBeenCalledWith(
      { title: "Dashboard", variant: "dashboard" },
      undefined,
    );
  });
});
