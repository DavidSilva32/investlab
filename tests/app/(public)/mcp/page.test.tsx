// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import McpPage from "@/app/(public)/mcp/page";

afterEach(cleanup);

describe("McpPage", () => {
  it("renders public MCP documentation", () => {
    render(<McpPage />);

    expect(
      screen.getByRole("heading", { name: "MCP do InvestLab" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Conectar ao ChatGPT" }),
    ).toBeTruthy();
  });
});
