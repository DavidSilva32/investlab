import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { useReducedMotion } from "@/lib/use-reduced-motion";

it("renders without window on the server", () => {
  function Probe() {
    return <span>{String(useReducedMotion())}</span>;
  }
  expect(renderToString(<Probe />)).toContain("true");
});
