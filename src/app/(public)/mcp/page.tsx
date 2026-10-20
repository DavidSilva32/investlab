import { mcpDocumentationResource } from "@/infrastructure/mcp/mcp-configuration";
import { McpDocumentation } from "@/app/(public)/mcp/_components/mcp-documentation";

export default function McpPage() {
  return <McpDocumentation endpoint={mcpDocumentationResource} />;
}
