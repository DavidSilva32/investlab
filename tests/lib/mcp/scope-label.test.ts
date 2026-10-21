import { describe, expect, it } from "vitest";
import { scopeLabel } from "@/lib/mcp/scope-label";

describe("scopeLabel", () => {
  it("explains known MCP permissions and preserves unknown scopes", () => {
    expect(scopeLabel("mcp:read")).toBe("Consultar sua carteira e posições.");
    expect(scopeLabel("mcp:admin:read")).toContain("somente para ADMIN");
    expect(scopeLabel("openid")).toBe(
      "Confirmar sua identidade para esta conexão.",
    );
    expect(scopeLabel("profile")).toBe(
      "Compartilhar informações básicas do seu perfil.",
    );
    expect(scopeLabel("email")).toBe("Compartilhar seu endereço de e-mail.");
    expect(scopeLabel("offline_access")).toBe(
      "Manter a conexão ativa até você revogá-la.",
    );
    expect(scopeLabel("custom:scope")).toBe("custom:scope");
  });
});
