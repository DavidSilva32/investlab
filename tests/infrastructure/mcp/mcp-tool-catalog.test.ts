import type { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { McpAdminReadToolsController } from "@/backend/controllers/mcp-admin-read-tools.controller";
import { McpPortfolioReadToolsController } from "@/backend/controllers/mcp-portfolio-read-tools.controller";
import { McpPortfolioWriteToolsController } from "@/backend/controllers/mcp-portfolio-write-tools.controller";
import { mcpDocumentedToolNames } from "@/infrastructure/mcp/mcp-tool-catalog";

describe("MCP documentation catalog", () => {
  it("contains exactly the read, write, and admin tools registered by the server", () => {
    const registeredNames: string[] = [];
    const server = {
      registerTool: (name: string) => registeredNames.push(name),
    } as unknown as McpServer;

    new McpPortfolioReadToolsController().register(server, "owner", "request");
    new McpPortfolioWriteToolsController().register(server, "owner", "request");
    new McpAdminReadToolsController().register(
      server,
      { sub: "admin", scope: ["mcp:admin:read"] },
      "request",
    );

    expect(registeredNames).toHaveLength(24);
    expect(registeredNames.sort()).toEqual([...mcpDocumentedToolNames].sort());
  });
});
