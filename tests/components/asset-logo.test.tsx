// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssetLogo } from "@/components/asset-logo";

afterEach(cleanup);
describe("AssetLogo", () => {
  it("keeps the prominent header fallback readable without an image", () => {
    const { container } = render(<AssetLogo ticker="VOO" size="xl" />);
    expect(screen.getByRole("img").style.width).toBe("64px");
    expect(screen.getByRole("img").className).toContain("text-lg");
    expect(screen.getByText("VO")).toBeDefined();
    expect(container.querySelector("img")).toBeNull();
  });
  it("shows an immediate accessible fallback and lazy isolated image", async () => {
    const { container } = render(<AssetLogo ticker="PETR4" name="Petrobras" />);
    expect(
      screen.getByRole("img", { name: "Identidade de Petrobras" }).style.width,
    ).toBe("32px");
    expect(screen.getByText("PE")).toBeDefined();
    const image = container.querySelector("img")!;
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("alt")).toBe("");
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(image.className).toContain("opacity-0");
    fireEvent.load(image);
    await waitFor(() => expect(image.className).not.toContain("opacity-0"));
  });
  it("removes failed images without changing dimensions or hiding the ticker", () => {
    const { container, rerender } = render(
      <AssetLogo ticker="PETR4" size="sm" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img").style.height).toBe("24px");
    expect(screen.getByText("PE")).toBeDefined();
    rerender(<AssetLogo ticker="VALE3" size="lg" className="custom" />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(screen.getByRole("img").style.width).toBe("40px");
    expect(screen.getByRole("img").className).toContain("custom");
  });
  it("does not request missing or unsafe images", () => {
    const { container, rerender } = render(<AssetLogo />);
    expect(
      screen.getByRole("img", { name: "Identidade de Ativo" }),
    ).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
    expect(container.querySelector("img")).toBeNull();
    rerender(<AssetLogo ticker="VOO" />);
    expect(
      screen.getByRole("img", { name: "Identidade de VOO" }),
    ).toBeDefined();
    expect(container.querySelector("img")).toBeNull();
    rerender(<AssetLogo ticker="PETR4" logoUrl="https://evil.test/logo.svg" />);
    expect(container.querySelector("img")).toBeNull();
  });
});
