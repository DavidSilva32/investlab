// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const pageLoading = vi.hoisted(() => vi.fn(() => <div>loading</div>));
vi.mock("@/components/app-page-skeleton", () => ({
  AppPageSkeleton: pageLoading,
}));
import Loading from "@/app/analyses/loading";
describe("AnalysesLoading", () => {
  it("uses the placeholder skeleton", () => {
    renderToStaticMarkup(<Loading />);
    expect(pageLoading).toHaveBeenCalledWith(
      { title: "Análises", variant: "placeholder" },
      undefined,
    );
  });
});
