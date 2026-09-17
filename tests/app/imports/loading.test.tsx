import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const pageLoading = vi.hoisted(() => vi.fn(() => <div>loading</div>));
vi.mock("@/components/app-page-skeleton", () => ({
  AppPageSkeleton: pageLoading,
}));
import Loading from "@/app/imports/loading";
describe("ImportsLoading", () => {
  it("uses the import skeleton", () => {
    renderToStaticMarkup(<Loading />);
    expect(pageLoading).toHaveBeenCalledWith(
      { title: "Importações", variant: "form" },
      undefined,
    );
  });
});
