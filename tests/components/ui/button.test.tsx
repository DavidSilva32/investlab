// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("uses an action cursor and preserves a distinct disabled cursor", () => {
    const { rerender } = render(<Button>Importar carteira</Button>);
    expect(
      screen.getByRole("button", { name: "Importar carteira" }).className,
    ).toContain("cursor-pointer");

    rerender(<Button disabled>Importar carteira</Button>);
    expect(
      screen.getByRole("button", { name: "Importar carteira" }).className,
    ).toContain("disabled:cursor-not-allowed");
  });
});
