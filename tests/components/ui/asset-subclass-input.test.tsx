// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetSubclassInput } from "@/components/ui/asset-subclass-input";

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {},
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ControlledInput({
  assetClass,
  onChange,
}: {
  assetClass: string;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <>
      <label htmlFor="subclass">Subclasse</label>
      <AssetSubclassInput
        id="subclass"
        assetClass={assetClass}
        value={value}
        onChange={(nextValue) => {
          setValue(nextValue);
          onChange(nextValue);
        }}
      />
    </>
  );
}

describe("AssetSubclassInput", () => {
  it("offers filtered suggestions for the selected class", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledInput assetClass="Renda variável" onChange={onChange} />);

    await user.click(screen.getByRole("combobox", { name: "Subclasse" }));
    const search = screen.getByPlaceholderText(
      "Digite para filtrar ou informar",
    );
    expect(screen.getByRole("option", { name: "ETF de ações" })).toBeTruthy();
    await user.type(search, "ETF");
    await user.click(screen.getByRole("option", { name: "ETF de ações" }));

    expect(onChange).toHaveBeenLastCalledWith("ETF de ações");
    expect(
      screen.getByRole("combobox", { name: "Subclasse" }).textContent,
    ).toContain("ETF de ações");
  });

  it("allows custom values when no class suggestions exist", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledInput assetClass="Outros" onChange={onChange} />);

    await user.click(screen.getByRole("combobox", { name: "Subclasse" }));
    await user.type(
      screen.getByPlaceholderText("Digite para filtrar ou informar"),
      "Meu produto",
    );
    await user.click(
      screen.getByRole("option", { name: "Usar “Meu produto”" }),
    );

    expect(onChange).toHaveBeenLastCalledWith("Meu produto");
    expect(
      screen.getByRole("combobox", { name: "Subclasse" }).textContent,
    ).toContain("Meu produto");
  });
});
