// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const pageLoading = vi.hoisted(() => vi.fn(() => <div>loading</div>));
vi.mock("@/components/app-page-skeleton", () => ({
  AppPageSkeleton: pageLoading,
}));
import Loading from "@/app/settings/loading";
describe("SettingsLoading", () => {
  it("uses the placeholder skeleton", () => {
    renderToStaticMarkup(<Loading />);
    expect(pageLoading).toHaveBeenCalledWith(
      { title: "Configurações", variant: "placeholder" },
      undefined,
    );
  });
});
