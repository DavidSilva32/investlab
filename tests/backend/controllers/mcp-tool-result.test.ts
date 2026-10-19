import { describe, expect, it } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";
import { toolError } from "@/backend/controllers/mcp-tool-result";

describe("MCP tool error mapping", () => {
  it("returns safe application messages to the MCP client", () => {
    expect(
      toolError(new ApplicationError("Conta não disponível.", 403)),
    ).toEqual({
      isError: true,
      content: [{ type: "text", text: "Conta não disponível." }],
    });
  });

  it("hides unexpected server error details", () => {
    expect(toolError(new Error("database password leaked"))).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "Não foi possível concluir a operação no InvestLab.",
        },
      ],
    });
  });
});
